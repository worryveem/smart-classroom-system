package iot.iot.ai;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import iot.iot.exception.AdminOperationException;
import static org.springframework.http.HttpStatus.*;

@Component
public class AiClient {
    private final RestClient client;
    @org.springframework.beans.factory.annotation.Autowired
    public AiClient(@Value("${app.ai.base-url:http://127.0.0.1:8000}") String baseUrl) {
        var uri = URI.create(baseUrl);
        if (!java.util.Set.of("http", "https").contains(uri.getScheme()) || uri.getHost() == null
                || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null)
            throw new IllegalArgumentException("Địa chỉ AI không hợp lệ");
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(5));
        client = RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
    }
    // Constructor dành cho kiểm thử hợp đồng HTTP.
    public AiClient(RestClient client) { this.client = client; }
    public JsonNode health() {
        try {
            var result = client.get().uri("/health").retrieve().body(JsonNode.class);
            if (result == null || !result.path("models").path("anomaly").isBoolean()
                    || !result.path("models").path("occupancy").isBoolean()) throw unavailable();
            return result;
        } catch (RestClientException ex) { throw unavailable(); }
    }
    public JsonNode anomaly(Object input) {
        try {
            var result = client.post().uri("/predict/anomaly/adc").body(input).retrieve().body(JsonNode.class);
            if (result == null || !java.util.Set.of("NORMAL", "ANOMALY").contains(result.path("label").asText())
                    || !result.path("decision_score").isNumber() || !Double.isFinite(result.path("decision_score").doubleValue())
                    || !result.path("suggestion").isTextual() || !result.path("notice").isTextual()
                    || !result.path("experimental").asBoolean(false)
                    || !result.path("light_conversion").path("light").isBoolean()) throw unavailable();
            return result;
        } catch (RestClientException ex) { throw unavailable(); }
    }
    public JsonNode occupancy(Object input) {
        try {
            var result=client.post().uri("/predict/occupancy/adc").body(input).retrieve().body(JsonNode.class);
            if(result==null || !java.util.Set.of("EMPTY","LOW","CROWDED").contains(result.path("label").asText())
                    || !result.path("experimental").asBoolean(false) || !result.path("suggestion").isTextual()
                    || !result.path("notice").isTextual()) throw unavailable();
            return result;
        } catch(RestClientException ex) { throw unavailable(); }
    }
    public JsonNode occupancyDemo(String sampleLabel) {
        try {
            var result=client.post().uri("/predict/occupancy/demo").body(java.util.Map.of("sample_label",sampleLabel)).retrieve().body(JsonNode.class);
            if(result==null || !java.util.Set.of("EMPTY","LOW","CROWDED").contains(result.path("label").asText())
                || !"SAMPLE_DATASET".equals(result.path("data_source").asText())
                || !result.path("notice").isTextual() || !result.path("sample").isObject()) throw unavailable();
            return result;
        } catch(RestClientException ex) { throw unavailable(); }
    }
    public JsonNode occupancyLive(Object input) {
        try {
            var result=client.post().uri("/predict/occupancy/live").body(input).retrieve().body(JsonNode.class);
            if(result==null || !java.util.Set.of("EMPTY","LOW","CROWDED").contains(result.path("label").asText())
                || !"CURRENT_SENSOR".equals(result.path("data_source").asText())
                || !result.path("notice").isTextual() || !result.path("features").isObject()
                || !result.path("estimated_light").isBoolean() || !result.path("notices").isArray()) throw unavailable();
            return result;
        } catch(RestClientException ex) { throw unavailable(); }
    }
    private AdminOperationException unavailable() {
        return new AdminOperationException(SERVICE_UNAVAILABLE,
            "Dịch vụ AI chưa sẵn sàng. Kiểm tra Python và phiên bản thư viện, sau đó thử lại.");
    }
}
