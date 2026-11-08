package iot.iot.integration.nodered;

import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.util.Timeout;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(NodeRedProperties.class)
public class NodeRedHttpConfig {
    @Bean(destroyMethod = "close")
    public CloseableHttpClient nodeRedHttpClient(NodeRedProperties properties) {
        var connections = PoolingHttpClientConnectionManagerBuilder.create()
            .setDefaultConnectionConfig(ConnectionConfig.custom()
                .setConnectTimeout(Timeout.ofMilliseconds(properties.connectTimeout()))
                .setSocketTimeout(Timeout.ofMilliseconds(properties.readTimeout())).build()).build();
        return HttpClients.custom().setConnectionManager(connections)
            .setDefaultRequestConfig(RequestConfig.custom()
                .setConnectionRequestTimeout(Timeout.ofMilliseconds(properties.connectTimeout()))
                .setResponseTimeout(Timeout.ofMilliseconds(properties.readTimeout())).build())
            .disableAutomaticRetries().disableRedirectHandling().build();
    }

    @Bean
    public RestClient nodeRedRestClient(@Qualifier("nodeRedHttpClient") CloseableHttpClient client) {
        return RestClient.builder().requestFactory(new HttpComponentsClientHttpRequestFactory(client)).build();
    }
}
