package iot.iot.integration.nodered;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.net.http.HttpTimeoutException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import iot.iot.dto.CommandStatus;
import iot.iot.exception.IntegrationException;

@Component
public class NodeRedClient {
    private final RestClient client;
    private final NodeRedProperties properties;
    private final ObjectMapper mapper;
    public NodeRedClient(@Qualifier("nodeRedRestClient") RestClient client,
                         NodeRedProperties properties, ObjectMapper mapper) {
        this.client = client; this.properties = properties; this.mapper = mapper;
    }

    public JsonNode state() {
        return exchange(client.get().uri(properties.stateUri()).accept(MediaType.APPLICATION_JSON));
    }

    public NodeRedCommandResponse command(NodeRedCommandRequest command) {
        JsonNode body = exchange(client.post().uri(properties.commandUri())
            .contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON).body(command));
        if (!body.isObject()) throw invalidResponse();
        JsonNode msg = body.get("msg");
        JsonNode status = body.get("status");
        if (msg != null && status != null && !msg.equals(status)) throw invalidResponse();
        JsonNode signal = msg != null ? msg : status;
        if (signal == null || !signal.isTextual()) throw invalidResponse();
        CommandStatus result;
        try { result = CommandStatus.valueOf(signal.textValue()); }
        catch (IllegalArgumentException error) { throw invalidResponse(); }
        // Only a full, correlated ACK can mean the actuator executed the command.
        boolean fullAck = result == CommandStatus.SUCCESS;
        match(body, "device_id", properties.actuatorDeviceId(), fullAck);
        match(body, "target", command.target().name(), fullAck);
        match(body, "action", command.action().name(), fullAck);
        if (result == CommandStatus.FAILURE) {
            throw new IntegrationException(HttpStatus.BAD_GATEWAY, "Node-RED reported command failure");
        }
        if (result == CommandStatus.TIMEOUT) {
            throw new IntegrationException(HttpStatus.GATEWAY_TIMEOUT,
                "Node-RED reported an ACK timeout");
        }
        return new NodeRedCommandResponse(result, body);
    }

    private void match(JsonNode body, String key, String expected, boolean required) {
        JsonNode value = body.get(key);
        if ((required && value == null) || (value != null && (!value.isTextual() || !expected.equals(value.textValue())))) {
            throw invalidResponse();
        }
    }

    private JsonNode exchange(RestClient.RequestHeadersSpec<?> request) {
        try {
            return request.exchange((req, response) -> {
                if (!response.getStatusCode().is2xxSuccessful()) {
                    throw new IntegrationException(HttpStatus.BAD_GATEWAY, "Node-RED returned an unsuccessful HTTP response");
                }
                try {
                    JsonNode body = mapper.readerFor(JsonNode.class)
                        .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readValue(response.getBody());
                    if (body == null || body.isNull() || !body.isContainerNode()) throw invalidResponse();
                    return body;
                } catch (IOException error) {
                    if (isTimeout(error)) throw timeout();
                    throw invalidResponse();
                }
            });
        } catch (ResourceAccessException error) {
            if (isTimeout(error)) throw timeout();
            throw new IntegrationException(HttpStatus.SERVICE_UNAVAILABLE, "Node-RED is unavailable");
        } catch (RestClientException error) {
            throw invalidResponse();
        }
    }

    private boolean isTimeout(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof InterruptedIOException || cause instanceof HttpTimeoutException
                || cause instanceof java.util.concurrent.TimeoutException) return true;
        }
        return false;
    }

    private IntegrationException timeout() {
        return new IntegrationException(HttpStatus.GATEWAY_TIMEOUT, "Node-RED response timed out");
    }

    private IntegrationException invalidResponse() {
        return new IntegrationException(HttpStatus.BAD_GATEWAY, "Node-RED returned an invalid or uncorrelated response");
    }
}
