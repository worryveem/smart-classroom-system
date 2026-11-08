package iot.iot;

final class MySqlTestSupport {
    private MySqlTestSupport() {}

    private static final String JWT_SECRET = java.util.Base64.getEncoder()
        .encodeToString(io.jsonwebtoken.Jwts.SIG.HS256.key().build().getEncoded());

    static String jwtSecret() { return JWT_SECRET; }

    static String url(String suffix) {
        String url = System.getenv("SMARTCLASS_MYSQL_TEST_URL");
        if (url == null || !url.matches("jdbc:mysql://[^/]+/smartclass_verify_[a-zA-Z0-9_]+\\?.*")) {
            throw new IllegalStateException("Tests require an isolated database named smartclass_verify_<unique suffix>");
        }
        int query = url.indexOf('?');
        return url.substring(0, query) + suffix + url.substring(query);
    }
}
