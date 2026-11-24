"""Kiểm chứng artifact thật, đối chiếu CSV đã xuất và thử API ADC."""

import json

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

import app as service


def main():
    with TestClient(service.app) as client:
        health = client.get('/health').json()
        if health['status'] != 'ready':
            raise RuntimeError(f'Model chưa sẵn sàng: {health}')
        report = {'health': health}
        sources = {
            'anomaly': (service.ROOT / 'AI1-Service/data/anomaly_results.csv', 'anomaly'),
            'occupancy': (service.ROOT / 'AI2_Occupancy/AI2_Occupancy/data/prediction_results.csv', 'predicted'),
        }
        for name, (path, label_column) in sources.items():
            data = pd.read_csv(path)
            sample = data.iloc[np.linspace(0, len(data) - 1, min(256, len(data)), dtype=int)]
            model = service.app.state.models[name]
            predictions = model.predict(sample[service.FEATURES[name]])
            matches = int(np.sum(predictions == sample[label_column].to_numpy()))
            if matches != len(sample):
                raise RuntimeError(f'{name}: chỉ khớp {matches}/{len(sample)} dự đoán CSV đã xuất')
            if name == 'anomaly':
                scores = model.decision_function(sample[service.FEATURES[name]])
                if not np.allclose(scores, sample['anomaly_score'].to_numpy(), atol=1e-8):
                    raise RuntimeError('Điểm bất thường không khớp CSV đã xuất')
            report[name] = {'csv_predictions_matched': matches, 'samples': len(sample)}
        response = client.post('/predict/anomaly/adc', json={
            'temp': 29.5, 'humidity': 71.0, 'motion': True,
            'ldr_adc': 3916, 'threshold': 4000, 'high_is_bright': False,
        })
        if response.status_code != 200 or response.json()['light_conversion']['light'] is not True:
            raise RuntimeError(f'API ADC lỗi: HTTP {response.status_code}')
        report['adc_api'] = {'status': response.status_code, 'label': response.json()['label']}
        result = response.json()
        values = {'temp': 29.5, 'humidity': 71.0, 'motion': True, 'light': result['light_conversion']['light']}
        explained = []
        for item in result.get('explanation', {}).get('items', []):
            changed = pd.DataFrame([values | {item['feature']: item['reference']}], columns=service.FEATURES['anomaly'])
            model = service.app.state.models['anomaly']
            changed_label = 'NORMAL' if int(model.predict(changed)[0]) == 1 else 'ANOMALY'
            gain = float(model.decision_function(changed)[0]) - result['decision_score']
            if changed_label != item['reference_label'] or not np.isclose(gain, item['score_gain']):
                raise RuntimeError('Giải thích không khớp phản ứng thật của model')
            explained.append(item['feature'])
        report['adc_api']['verified_explanation_features'] = explained
        report['occupancy_demo'] = {}
        for label in ('EMPTY', 'LOW', 'CROWDED'):
            response = client.post('/predict/occupancy/demo', json={'sample_label': label})
            if response.status_code != 200 or response.json().get('data_source') != 'SAMPLE_DATASET':
                raise RuntimeError(f'API mẫu hiện diện lỗi: {label}')
            report['occupancy_demo'][label] = response.json()['label']
        response = client.post('/predict/occupancy/live', json={'temperatures': [25.0], 'lights': [400.0], 'pir_values': [1], 'hour': 17, 'light_source': 'LDR_DEMO_LUX'})
        if response.status_code != 200 or response.json().get('data_source') != 'CURRENT_SENSOR':
            raise RuntimeError('API hiện diện từ cảm biến lỗi')
        report['occupancy_live'] = {'label': response.json()['label'], 'features': response.json()['features'], 'estimated_light': response.json()['estimated_light']}
        print(json.dumps(report, ensure_ascii=True))


if __name__ == '__main__':
    main()
