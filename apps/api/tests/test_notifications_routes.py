from fastapi.testclient import TestClient

from app.main import create_app


def test_notifications_routes_are_registered() -> None:
    app = create_app()
    client = TestClient(app)

    for path in [
        "/api/schools/notifications",
        "/api/v1/schools/notifications",
        "/api/schools/notifications/unread-count",
    ]:
        response = client.get(path, follow_redirects=False)
        assert response.status_code == 401
