"""Kiểm tra API, thứ tự đầu vào và trạng thái model lỗi."""

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import app as service


class FakeModel:
    def __init__(self, features, label):
        self.feature_names_in_ = features
        self.label = label

    def predict(self, frame):
        assert list(frame.columns) == self.feature_names_in_
        return [self.label]

    def decision_function(self, frame):
        return [-0.05]


class ApiTests(unittest.TestCase):
    def setUp(self):
        def load(path):
            name = "anomaly" if path.name == "anomaly_model.pkl" else "occupancy"
            return FakeModel(service.FEATURES[name], -1 if name == "anomaly" else "CROWDED")
        self.loader = patch.object(service.joblib, "load", side_effect=load)
        self.loader.start()
        self.client = TestClient(service.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.loader.stop()

    def test_anomaly_suggestion(self):
        result = self.client.post("/predict/anomaly", json={
            "temp": 29.5, "humidity": 71, "light": False, "motion": True,
        })
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["label"], "ANOMALY")
        self.assertTrue(result.json()["experimental"])

    def test_reject_lux_as_boolean_and_invalid_values(self):
        payload = {"temp": 29.5, "humidity": 71, "light": False, "motion": True}
        for changes in ({"light": 230}, {"humidity": 101}, {"temp": "nan"}, {"lux": 230}):
            with self.subTest(changes=changes):
                self.assertEqual(self.client.post("/predict/anomaly", json=payload | changes).status_code, 422)

    def test_occupancy_range_notice_and_validation(self):
        payload = {"temp_mean": 30, "light_mean": 230, "pir_active": 1, "hour": 10}
        result = self.client.post("/predict/occupancy", json=payload)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["label"], "CROWDED")
        self.assertEqual(len(result.json()["notices"]), 2)
        for changes in ({"hour": 24}, {"pir_active": 2}, {"temp_mean": None}):
            self.assertEqual(self.client.post("/predict/occupancy", json=payload | changes).status_code, 422)

    def test_unavailable_model(self):
        service.app.state.models.clear()
        self.assertEqual(self.client.get("/health").json()["status"], "degraded")
        result = self.client.post("/predict/occupancy", json={
            "temp_mean": 25, "light_mean": 62, "pir_active": 0, "hour": 10,
        })
        self.assertEqual(result.status_code, 503)


if __name__ == "__main__":
    unittest.main()
