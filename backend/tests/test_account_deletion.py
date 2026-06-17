"""Integration tests for DELETE /api/v1/profile (in-app account deletion).

These exercise the real FastAPI route + dependency injection. The Supabase client
is replaced with a recording fake so we assert the deletion *sequence* our code
controls: purge entry attachments, purge avatar(s), then delete the auth user.
The DB cascade that delete_user triggers is a Postgres FK guarantee (verified at
the schema level), not application logic, so it is intentionally not tested here.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth.jwt import get_current_user
import app.routers.profile as profile_router

TEST_USER = "11111111-1111-1111-1111-111111111111"


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    """Minimal postgrest stub — only entries.select(...).eq(...).execute() is used."""
    def __init__(self, data):
        self._data = data

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def execute(self):
        return _Resp(self._data)


class _Bucket:
    def __init__(self, recorder, name, raise_on_remove=False):
        self._rec = recorder
        self._name = name
        self._raise = raise_on_remove

    def list(self, path):
        self._rec.append(("list", self._name, path))
        return [{"name": "profile.jpg"}] if self._name == "avatars" else []

    def remove(self, paths):
        self._rec.append(("remove", self._name, list(paths)))
        if self._raise:
            raise RuntimeError("storage unavailable")
        return None


class _Storage:
    def __init__(self, recorder, raise_on_remove=False):
        self._rec = recorder
        self._raise = raise_on_remove

    def from_(self, name):
        return _Bucket(self._rec, name, self._raise)


class _AuthAdmin:
    def __init__(self, recorder, fail=False):
        self._rec = recorder
        self._fail = fail

    def delete_user(self, uid, **k):
        self._rec.append(("delete_user", uid))
        if self._fail:
            raise RuntimeError("auth delete failed")


class FakeSupabase:
    def __init__(self, entries, fail_delete=False, raise_on_remove=False):
        self.recorder = []
        self._entries = entries
        self.storage = _Storage(self.recorder, raise_on_remove)
        self.auth = type("A", (), {"admin": _AuthAdmin(self.recorder, fail_delete)})()

    def table(self, name):
        return _Query(self._entries)


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: TEST_USER
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def _patch(monkeypatch, fake):
    monkeypatch.setattr(profile_router, "get_supabase", lambda: fake)


def test_delete_account_purges_storage_then_deletes_user(client, monkeypatch):
    fake = FakeSupabase(entries=[
        {"attachment_path": "u/a/attachment.jpg"},
        {"attachment_path": None},
        {"attachment_path": "u/b/attachment.pdf"},
    ])
    _patch(monkeypatch, fake)

    res = client.delete("/api/v1/profile")
    assert res.status_code == 204

    rec = fake.recorder
    assert ("remove", "attachments", ["u/a/attachment.jpg", "u/b/attachment.pdf"]) in rec
    assert ("list", "avatars", TEST_USER) in rec
    assert ("remove", "avatars", [f"{TEST_USER}/profile.jpg"]) in rec
    # the auth-user deletion (which cascades all DB rows) must run last
    assert rec[-1] == ("delete_user", TEST_USER)


def test_delete_account_no_attachments_skips_attachment_remove(client, monkeypatch):
    fake = FakeSupabase(entries=[{"attachment_path": None}])
    _patch(monkeypatch, fake)

    res = client.delete("/api/v1/profile")
    assert res.status_code == 204
    assert not any(c[0] == "remove" and c[1] == "attachments" for c in fake.recorder)
    assert ("delete_user", TEST_USER) in fake.recorder


def test_delete_account_storage_failure_is_non_fatal(client, monkeypatch):
    fake = FakeSupabase(entries=[{"attachment_path": "u/a/x.jpg"}], raise_on_remove=True)
    _patch(monkeypatch, fake)

    res = client.delete("/api/v1/profile")
    # storage purge is best-effort; the auth user must still be deleted
    assert res.status_code == 204
    assert ("delete_user", TEST_USER) in fake.recorder


def test_delete_account_auth_failure_returns_500(client, monkeypatch):
    fake = FakeSupabase(entries=[], fail_delete=True)
    _patch(monkeypatch, fake)

    res = client.delete("/api/v1/profile")
    assert res.status_code == 500
    assert res.json()["detail"] == "Failed to delete account"


def test_delete_account_requires_auth(monkeypatch):
    # No dependency override → missing Authorization header → never 204, never deletes
    fake = FakeSupabase(entries=[])
    _patch(monkeypatch, fake)
    res = TestClient(app, raise_server_exceptions=False).delete("/api/v1/profile")
    assert res.status_code in (401, 422)
    assert ("delete_user", TEST_USER) not in fake.recorder
