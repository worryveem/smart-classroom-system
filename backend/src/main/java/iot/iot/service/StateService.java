package iot.iot.service;

import com.fasterxml.jackson.databind.JsonNode;
import iot.iot.integration.nodered.NodeRedClient;
import org.springframework.stereotype.Service;

@Service
public class StateService {
    private final NodeRedClient nodeRed;
    public StateService(NodeRedClient nodeRed) { this.nodeRed = nodeRed; }
    public JsonNode getState() { return nodeRed.state(); }
}
