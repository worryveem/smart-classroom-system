"""Kiểm chứng giải thích bám phản ứng model, không gán nguyên nhân hoặc ngưỡng giả."""

import unittest
from unittest.mock import Mock, patch

from anomaly_explanation import explain


class MotionModel:
    def decision_function(self, frame):
        return [-0.2 if motion else 0.2 for motion in frame['motion']]

    def predict(self, frame):
        return [-1 if motion else 1 for motion in frame['motion']]


class ExplanationTests(unittest.TestCase):
    values = {'temp': 25.0, 'humidity': 60.0, 'light': False, 'motion': True}
    references = {'temp': (25.,), 'humidity': (60.,), 'light': (False,), 'motion': (False,)}

    def test_reports_feature_only_when_changing_it_changes_the_actual_model_score(self):
        with patch('anomaly_explanation.reference_values', return_value=self.references):
            result = explain(MotionModel(), self.values, -1, -0.2)
        self.assertEqual(result['method'], 'single_feature_counterfactual')
        self.assertEqual(len(result['items']), 1)
        item = result['items'][0]
        self.assertEqual(item['feature'], 'motion')
        self.assertEqual(item['reference_label'], 'NORMAL')
        self.assertAlmostEqual(item['score_gain'], 0.4)
        self.assertIn('model không còn cảnh báo', item['detail'])
        self.assertNotIn('quá nóng', item['detail'])

    def test_no_invented_feature_when_model_does_not_respond(self):
        model = Mock()
        model.decision_function.return_value = [-0.2]
        model.predict.return_value = [-1]
        with patch('anomaly_explanation.reference_values', return_value=self.references):
            result = explain(model, self.values, -1, -0.2)
        self.assertEqual(result['items'], [])

    def test_normal_result_does_not_run_counterfactuals(self):
        model = Mock()
        result = explain(model, self.values, 1, 0.2)
        self.assertEqual(result['method'], 'not_required')
        self.assertEqual(result['items'], [])
        self.assertEqual(model.mock_calls, [])

    def test_explanation_failure_falls_back_without_failing_prediction(self):
        with patch('anomaly_explanation.reference_values', side_effect=FileNotFoundError('reference')):
            result = explain(MotionModel(), self.values, -1, -0.2)
        self.assertEqual(result['method'], 'unavailable')
        self.assertEqual(result['items'], [])


if __name__ == '__main__':
    unittest.main()
