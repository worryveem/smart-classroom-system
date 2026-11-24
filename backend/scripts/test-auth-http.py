"""Read-only HTTP smoke test; requires a running backend and existing local seed users.
Never prints tokens, passwords or raw authentication responses.
"""
import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request

BASE = os.environ.get("AUTH_BASE_URL", "http://localhost:8080").rstrip("/")

def call(method, path, payload=None, token=None, origin=None, extra_headers=None):
    headers = {"Accept": "application/json"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    if origin:
        headers["Origin"] = origin
    headers.update(extra_headers or {})
    request = urllib.request.Request(BASE + path, data=None if payload is None else json.dumps(payload).encode(), headers=headers, method=method)
    try:
        response = urllib.request.urlopen(request, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read().decode()
        return response.status, response.headers, json.loads(raw) if raw else None

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def decode(value):
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))

def main():
    if os.environ.get("AUTH_TEST_EXPIRATION") == "true":
        status, _, body = call("POST", "/api/auth/login", {"username": "admin", "password": os.environ.get("AUTH_ADMIN_PASSWORD", "Admin@12345")})
        require(status == 200, "Expiration login failed")
        require(body["data"]["expiresIn"] <= 5, "Use short JWT_EXPIRATION only for expiration testing")
        token = body["data"]["accessToken"]
        time.sleep(body["data"]["expiresIn"] + 1)
        require(call("GET", "/api/auth/me", token=token)[0] == 401, "Expired token must be rejected")
        print("PASS real HTTP short-lived JWT expiration")
        return
    tokens = {}
    for username, role, default in [("admin", "ADMIN", "Admin@12345"), ("teacher", "TEACHER", "Teacher@12345"), ("student", "STUDENT", "Student@12345")]:
        password = os.environ.get("AUTH_" + role + "_PASSWORD", default)
        status, headers, body = call("POST", "/api/auth/login", {"username": username, "password": password})
        require(status == 200, username + " login must succeed")
        data = body["data"]
        require(data["user"]["role"] == role and data["tokenType"] == "Bearer", "Wrong user role or token type")
        require("password" not in json.dumps(body).lower() and "$2a$" not in json.dumps(body), "Sensitive password data in response")
        require(headers.get("Set-Cookie") is None, "Unexpected session cookie")
        token = data["accessToken"]
        parts = token.split(".")
        claims = json.loads(decode(parts[1]))
        require(claims["sub"] == username and claims["role"] == role and claims["userId"] == data["user"]["id"], "Wrong JWT claims")
        require(0 < claims["exp"] - claims["iat"] <= data["expiresIn"] + 1, "Invalid JWT lifetime")
        if os.environ.get("JWT_SECRET"):
            key = base64.b64decode(os.environ["JWT_SECRET"], validate=True)
            expected = hmac.new(key, (parts[0] + "." + parts[1]).encode(), hashlib.sha256).digest()
            require(hmac.compare_digest(expected, decode(parts[2])), "JWT signature did not verify")
        tokens[username] = token
        status, _, me = call("GET", "/api/auth/me?username=someone_else&id=999", token=token)
        require(status == 200 and me["data"]["username"] == username and me["data"]["id"] == data["user"]["id"], "Wrong /me identity")
        print("PASS login + JWT + /me: " + role)

    bad = call("POST", "/api/auth/login", {"username": "admin", "password": "invalid-password"})
    missing = call("POST", "/api/auth/login", {"username": "not_a_user", "password": "invalid-password"})
    require(bad[0] == missing[0] == 401 and bad[2] == missing[2], "Credential failures differ")
    require(call("POST", "/api/auth/login", {})[0] == 400, "Missing login fields must be 400")
    require(call("GET", "/api/auth/me")[0] == 401, "Missing JWT must be 401")
    require(call("GET", "/api/auth/me?token=" + tokens["admin"])[0] == 401, "Query parameter JWT must be ignored")
    require(call("GET", "/api/auth/me", token="bad.jwt.value")[0] == 401, "Malformed JWT must be 401")
    parts = tokens["admin"].split(".")
    signature = bytearray(decode(parts[2])); signature[0] ^= 1
    tampered = parts[0] + "." + parts[1] + "." + base64.urlsafe_b64encode(signature).rstrip(b"=").decode()
    require(call("GET", "/api/auth/me", token=tampered)[0] == 401, "Tampered JWT must be 401")
    for username in ["teacher", "student"]:
        require(call("GET", "/api/users", token=tokens[username])[0] == 403, "Non-admin must get 403")
        require(call("GET", "/api/devices", token=tokens[username])[0] == 403, "Non-admin devices access must get 403")
    require(call("GET", "/api/users", token=tokens["admin"])[0] == 200, "ADMIN user list should be available")
    require(call("GET", "/api/devices", token=tokens["admin"])[0] == 200, "ADMIN device list should be available")
    for token in tokens.values():
        require(call("GET", "/api/state", token=token)[0] in (200, 502, 503, 504), "Authenticated state endpoint should pass Security")
    print("PASS invalid credentials, validation, invalid/missing JWT and role boundaries")
    for method in ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]:
        status, headers, _ = call("OPTIONS", "/api/auth/me", origin="http://localhost:5173", extra_headers={
            "Access-Control-Request-Method": method, "Access-Control-Request-Headers": "Authorization,Content-Type"})
        require(status == 200 and headers.get("Access-Control-Allow-Origin") == "http://localhost:5173", "CORS preflight failed")
    require(call("OPTIONS", "/api/auth/login", origin="https://untrusted.example", extra_headers={"Access-Control-Request-Method": "POST"})[0] == 403, "Untrusted origin should be rejected")
    print("PASS CORS: six methods, trusted origin allowed, other origin denied")

if __name__ == "__main__":
    main()
