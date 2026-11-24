package iot.iot;

import com.fasterxml.jackson.databind.ObjectMapper;
import iot.iot.dto.*;
import iot.iot.exception.IntegrationException;
import iot.iot.integration.nodered.*;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import static org.junit.jupiter.api.Assertions.*;

class NodeRedClientTests {
    private final NodeRedStub stub = new NodeRedStub();
    private final ObjectMapper mapper = new ObjectMapper();
    private final NodeRedProperties props = new NodeRedProperties(stub.baseUrl(), "/smarthome/api/state", "/smarthome/api/cmd", 500, 1000, "node2_actuator");
    private final NodeRedHttpConfig config = new NodeRedHttpConfig();
    private final CloseableHttpClient http = config.nodeRedHttpClient(props);
    private final NodeRedClient client = new NodeRedClient(config.nodeRedRestClient(http), props, mapper);
    private final NodeRedCommandRequest command = new NodeRedCommandRequest(ControlTarget.FAN, ControlAction.ON);
    @AfterEach void cleanup() throws Exception { http.close(); stub.close(); }

    @Test
    void statePreservesNestedUnknownFieldsWithoutReadingTelemetry() throws Exception {
        String json="{\"sensors\":[{\"temp\":29.5,\"humid\":71,\"lux\":230,\"occupancy\":1}],\"FAN\":true,\"extra\":{\"online\":false,\"future_field\":[1,null]}}";
        stub.reply(200,json);
        assertEquals(mapper.readTree(json),client.state());
        assertEquals(1,stub.calls.size()); assertEquals("GET",stub.calls.get(0).method());
        assertEquals("/smarthome/api/state",stub.calls.get(0).path());
        assertNull(stub.calls.get(0).authorization());
    }
    @Test
    void successRequiresFullMatchingAckAndSendsOnlyTwoFields() throws Exception {
        stub.reply(200,"{\"device_id\":\"node2_actuator\",\"target\":\"FAN\",\"action\":\"ON\",\"msg\":\"SUCCESS\",\"extra\":12}");
        var result=client.command(command);
        assertEquals(CommandStatus.SUCCESS,result.status()); assertEquals(12,result.payload().path("extra").asInt());
        assertEquals(1,stub.calls.size());
        var call=stub.calls.get(0); assertEquals("POST",call.method()); assertEquals("/smarthome/api/cmd",call.path());
        assertEquals(mapper.readTree("{\"target\":\"FAN\",\"action\":\"ON\"}"),mapper.readTree(call.body()));
        assertNull(call.authorization());
    }
    @Test
    void acceptedIsNotExecutionSuccess() {
        stub.reply(202,"{\"status\":\"ACCEPTED\",\"queue_id\":7}");
        assertEquals(CommandStatus.ACCEPTED,client.command(command).status());
    }
    @ParameterizedTest
    @ValueSource(strings={"{}","null","[]","not-json","{\"msg\":\"SUCCESS\"}",
        "{\"success\":true}","{\"msg\":\"SUCCESS\",\"status\":\"ACCEPTED\"}",
        "{\"msg\":\"SUCCESS\",\"device_id\":\"node2_actuator\",\"target\":\"LIGHT\",\"action\":\"ON\"}",
        "{\"msg\":\"SUCCESS\",\"device_id\":\"wrong_device\",\"target\":\"FAN\",\"action\":\"ON\"}",
        "{\"msg\":\"SUCCESS\",\"device_id\":\"node2_actuator\",\"target\":\"FAN\",\"action\":\"OFF\"}",
        "{\"msg\":\"ACCEPTED\",\"target\":\"LIGHT\"}","{\"msg\":\"ACCEPTED\"} {}"})
    void rejectsAmbiguousInvalidOrMismatchedResponsesWithoutRetry(String json) {
        stub.reply(200,json);
        var error=assertThrows(IntegrationException.class,()->client.command(command));
        assertEquals(HttpStatus.BAD_GATEWAY,error.getStatus()); assertEquals(1,stub.calls.size());
    }
    @ParameterizedTest
    @ValueSource(ints={400,404,500,503,302})
    void upstreamErrorsAndRedirectsDoNotRetryOrTryAlternateEndpoint(int status) {
        stub.reply(status,"{}");
        assertEquals(HttpStatus.BAD_GATEWAY,assertThrows(IntegrationException.class,()->client.command(command)).getStatus());
        assertEquals(1,stub.calls.size()); assertEquals("/smarthome/api/cmd",stub.calls.get(0).path());
    }
    @Test
    void explicitFailureAndAckTimeoutAreDistinct() {
        stub.reply(200,"{\"msg\":\"FAILURE\"}");
        assertEquals(HttpStatus.BAD_GATEWAY,assertThrows(IntegrationException.class,()->client.command(command)).getStatus());
        stub.reply(200,"{\"msg\":\"TIMEOUT\"}");
        assertEquals(HttpStatus.GATEWAY_TIMEOUT,assertThrows(IntegrationException.class,()->client.command(command)).getStatus());
        assertEquals(2,stub.calls.size());
    }
    @Test
    void readTimeoutDoesNotResendTheCommand() {
        stub.reply=new NodeRedStub.Reply(200,"{\"msg\":\"ACCEPTED\"}",1800,false);
        assertEquals(HttpStatus.GATEWAY_TIMEOUT,assertThrows(IntegrationException.class,()->client.command(command)).getStatus());
        assertEquals(1,stub.calls.size());
    }
    @Test
    void responseBodyTimeoutAfterHeadersIsStill504AndDoesNotRetry() {
        stub.reply(200,"{\"msg\":\"ACCEPTED\"}");
        stub.bodyDelayMillis=1800;
        assertEquals(HttpStatus.GATEWAY_TIMEOUT,assertThrows(IntegrationException.class,()->client.command(command)).getStatus());
        assertEquals(1,stub.calls.size());
    }
    @Test
    void droppedConnectionDoesNotRetryPost() {
        stub.reply=new NodeRedStub.Reply(200,"{}",0,true);
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(IntegrationException.class,()->client.command(command)).getStatus());
        assertEquals(1,stub.calls.size());
    }
    @Test
    void offlineMapsTo503() {
        stub.close();
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(IntegrationException.class,client::state).getStatus());
    }
    @Test
    void configurationRejectsUnboundedTimeoutsAndExternalApiPaths() {
        assertThrows(IllegalStateException.class,()->new NodeRedProperties(stub.baseUrl(),"/state","//other-host/cmd",500,250,"node2_actuator"));
        assertThrows(IllegalStateException.class,()->new NodeRedProperties(stub.baseUrl(),"/state","/cmd",0,250,"node2_actuator"));
    }
}
