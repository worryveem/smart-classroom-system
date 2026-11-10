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
        return [self.label] * len(frame)

    def decision_function(self, frame):
        return [-0.05] * len(frame)


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

    def test_adc_conversion_and_boundaries(self):
        payload = {"temp": 29.5, "humidity": 71, "motion": True,
                   "ldr_adc": 3916, "threshold": 4000, "high_is_bright": False}
        for adc, high, expected in ((3916, False, True), (4000, False, False),
                                    (4095, False, False), (0, False, True),
                                    (4000, True, True), (3999, True, False)):
            with self.subTest(adc=adc, high=high):
                result = self.client.post("/predict/anomaly/adc", json=payload | {"ldr_adc": adc, "high_is_bright": high})
                self.assertEqual(result.status_code, 200)
                self.assertEqual(result.json()["light_conversion"]["light"], expected)

    def test_invalid_adc_and_missing_values(self):
        payload = {"temp": 29.5, "humidity": 71, "motion": True,
                   "ldr_adc": 3916, "threshold": 4000, "high_is_bright": False}
        for changes in ({"ldr_adc": -1}, {"ldr_adc": 4096}, {"ldr_adc": 3.5},
                        {"ldr_adc": True}, {"threshold": 0}, {"threshold": 4095},
                        {"motion": None}, {"high_is_bright": 1}, {"lux": 400}):
            with self.subTest(changes=changes):
                self.assertEqual(self.client.post("/predict/anomaly/adc", json=payload | changes).status_code, 422)

    def test_adc_feature_values_reach_model(self):
        model = service.app.state.models["anomaly"]
        with patch.object(model, "predict", wraps=model.predict) as predict:
            result = self.client.post("/predict/anomaly/adc", json={
                "temp": 29.5, "humidity": 71, "motion": True, "ldr_adc": 3916, "threshold": 4000})
            self.assertEqual(result.status_code, 200)
            self.assertEqual(predict.call_args_list[0].args[0].iloc[0].to_dict(),
                             {"temp": 29.5, "humidity": 71, "light": True, "motion": True})

    def test_nonfinite_model_score_is_unavailable(self):
        with patch.object(service.app.state.models["anomaly"], "decision_function", return_value=[float('nan')]):
            self.assertEqual(self.client.post("/predict/anomaly", json={
                "temp": 29.5, "humidity": 71, "light": False, "motion": True}).status_code, 503)

    def test_local_occupancy_requires_trained_model_and_matching_sensor(self):
        payload = {'sensor_id': 'test_sensor', 'temp': 25.0, 'ldr_adc': 3916, 'motion': True, 'hour': 10}
        self.assertEqual(self.client.post('/predict/occupancy/adc', json=payload).status_code, 503)
        model = FakeModel(service.ADC_FEATURES, 'LOW')
        model.occupancy_metadata_ = {'sensor_id': 'test_sensor', 'crowded_min': 11, 'trained_at': 'test'}
        service.app.state.models['occupancy_adc'] = model
        result = self.client.post('/predict/occupancy/adc', json=payload)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['label'], 'LOW')
        self.assertEqual(self.client.post('/predict/occupancy/adc', json=payload | {'sensor_id': 'another_sensor'}).status_code, 422)
        self.assertEqual(self.client.post('/predict/occupancy/adc', json=payload | {'ldr_adc': 4096}).status_code, 422)

    def test_demo_uses_existing_samples_but_returns_actual_model_prediction(self):
        for label in ('EMPTY', 'LOW', 'CROWDED'):
            result = self.client.post('/predict/occupancy/demo', json={'sample_label': label})
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json()['data_source'], 'SAMPLE_DATASET')
            self.assertEqual(result.json()['label'], 'CROWDED')  # Nhãn do FakeModel dự đoán, không sao chép nhãn mẫu.
            self.assertIn('light_mean', result.json()['sample'])
        self.assertEqual(self.client.post('/predict/occupancy/demo', json={'sample_label': 'UNKNOWN'}).status_code, 422)
        service.app.state.models.pop('occupancy')
        self.assertEqual(self.client.post('/predict/occupancy/demo', json={'sample_label': 'EMPTY'}).status_code, 503)

    def test_live_occupancy_matches_original_row_aggregation(self):
        payload = {'temperatures': [24.0, 25.0, 26.0, 27.0], 'lights': [20.0, 40.0, 60.0, 80.0],
                   'pir_values': [0, 1], 'hour': 10, 'light_source': 'CALIBRATED_LUX'}
        model = service.app.state.models['occupancy']
        with patch.object(model, 'predict', wraps=model.predict) as predict:
            result = self.client.post('/predict/occupancy/live', json=payload)
            self.assertEqual(result.status_code, 200)
            self.assertEqual(predict.call_args.args[0].iloc[0].to_dict(),
                             {'temp_mean': 25.5, 'light_mean': 50.0, 'pir_active': 1, 'hour': 10})
            self.assertEqual(result.json()['data_source'], 'CURRENT_SENSOR')
            self.assertFalse(result.json()['estimated_light'])

    def test_live_single_sensor_preserves_value_and_warns_for_estimated_light(self):
        payload = {'temperatures': [29.5], 'lights': [400.0], 'pir_values': [0], 'hour': 17, 'light_source': 'LDR_DEMO_LUX'}
        result = self.client.post('/predict/occupancy/live', json=payload)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['features']['light_mean'], 400.0)
        self.assertEqual(result.json()['features']['temp_mean'], 29.5)
        self.assertTrue(result.json()['estimated_light'])
        self.assertTrue(result.json()['out_of_training_range'])
        self.assertEqual(result.json()['sensor_counts']['light'], 1)
        for changes in ({'lights': []}, {'lights': [-1]}, {'lights': ['nan']}, {'pir_values': [2]}, {'hour': 24}):
            self.assertEqual(self.client.post('/predict/occupancy/live', json=payload | changes).status_code, 422)


if __name__ == "__main__":
    unittest.main()
