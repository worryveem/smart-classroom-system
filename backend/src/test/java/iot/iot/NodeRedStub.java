package iot.iot;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// Loopback-only HTTP fixture. It never forwards a command to Node-RED, MQTT or an ESP32.
final class NodeRedStub implements AutoCloseable {
    record Call(String method, String path, String body, String authorization) {}
    record Reply(int status, String body, long delayMillis, boolean closeConnection) {}
    private final HttpServer server;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    final List<Call> calls = new CopyOnWriteArrayList<>();
    volatile long bodyDelayMillis;
    volatile Reply reply = new Reply(200, "{}", 0, false);

    NodeRedStub() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.setExecutor(executor);
            server.createContext("/", exchange -> {
                Reply current = reply;
                long bodyDelay = bodyDelayMillis;
                calls.add(new Call(exchange.getRequestMethod(), exchange.getRequestURI().getPath(),
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8),
                    exchange.getRequestHeaders().getFirst("Authorization")));
                try {
                    if (current.delayMillis() > 0) Thread.sleep(current.delayMillis());
                    if (current.closeConnection()) return;
                    byte[] body = current.body().getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    if (current.status() == 302) exchange.getResponseHeaders().set("Location", baseUrl() + "/alternate");
                    exchange.sendResponseHeaders(current.status(), body.length);
                    exchange.getResponseBody().flush();
                    if (bodyDelay > 0) Thread.sleep(bodyDelay);
                    exchange.getResponseBody().write(body);
                } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
                catch (IOException ignored) { /* Client may have timed out deliberately. */ }
                finally { exchange.close(); }
            });
            server.start();
        } catch (IOException error) { throw new IllegalStateException("Cannot start loopback HTTP test fixture", error); }
    }
    String baseUrl() { return "http://127.0.0.1:" + server.getAddress().getPort(); }
    void reply(int status, String json) { reply = new Reply(status, json, 0, false); }
    @Override public void close() { server.stop(0); executor.shutdownNow(); }
}
