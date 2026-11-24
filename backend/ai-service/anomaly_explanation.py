"""Giải thích cục bộ bằng cách thử thay từng đặc trưng, không suy diễn nguyên nhân vật lý."""

import logging
import math
from functools import lru_cache
from pathlib import Path

import pandas as pd

FEATURES = ['temp', 'humidity', 'light', 'motion']
NAMES = {'temp': 'Nhiệt độ', 'humidity': 'Độ ẩm', 'light': 'Ánh sáng', 'motion': 'Chuyển động'}
LOGGER = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def reference_values():
    path = Path(__file__).resolve().parent / 'AI1-Service/data/anomaly_results.csv'
    data = pd.read_csv(path, usecols=FEATURES + ['anomaly'])
    normal = data.loc[data['anomaly'] == 1, FEATURES].dropna()
    if normal.empty:
        raise ValueError('Thiếu mẫu tham chiếu bình thường')
    return {
        'temp': tuple(float(value) for value in normal['temp'].quantile([0.1, 0.5, 0.9])),
        'humidity': tuple(float(value) for value in normal['humidity'].quantile([0.1, 0.5, 0.9])),
        'light': (bool(normal['light'].mode().iloc[0]),),
        'motion': (bool(normal['motion'].mode().iloc[0]),),
    }


def display(feature, value):
    if feature == 'light':
        return 'sáng' if value else 'tối'
    if feature == 'motion':
        return 'có chuyển động' if value else 'không chuyển động'
    return f'{value:.2f}'.rstrip('0').rstrip('.') + (' °C' if feature == 'temp' else '%')


def explain(model, values, label, original_score):
    if label == 1:
        return {'method': 'not_required', 'summary': 'Model chưa phát hiện tổ hợp khác thường.', 'items': []}
    fallback = {'method': 'unavailable', 'summary': 'Tổ hợp số đo khác những mẫu model đã học.', 'items': [],
                'notice': 'Chưa xác định được yếu tố nổi bật; không suy ra nguyên nhân sự cố.'}
    try:
        candidates, identities = [], []
        for feature, references in reference_values().items():
            for reference in dict.fromkeys(references):
                if reference != values[feature]:
                    candidates.append(values | {feature: reference})
                    identities.append((feature, reference))
        if not candidates:
            return fallback
        frame = pd.DataFrame(candidates, columns=FEATURES)
        scores = model.decision_function(frame)
        predictions = model.predict(frame)
        if len(scores) != len(candidates) or len(predictions) != len(candidates):
            return fallback
        best = {}
        for (feature, reference), score, prediction in zip(identities, scores, predictions):
            score, prediction = float(score), int(prediction)
            if not math.isfinite(score) or prediction not in (-1, 1):
                continue
            gain = score - original_score
            if gain > 0.00001 and (feature not in best or gain > best[feature]['score_gain']):
                switched = prediction == 1
                best[feature] = {
                    'feature': feature, 'title': NAMES[feature], 'observed': values[feature], 'reference': reference,
                    'score_gain': gain, 'reference_label': 'NORMAL' if switched else 'ANOMALY',
                    'detail': f"Đổi riêng {display(feature, values[feature])} thành {display(feature, reference)}: "
                              + ('model không còn cảnh báo.' if switched else 'model đánh giá ít khác thường hơn, nhưng vẫn cảnh báo.'),
                }
        items = sorted(best.values(), key=lambda item: item['score_gain'], reverse=True)[:2]
        return {'method': 'single_feature_counterfactual',
                'summary': 'Yếu tố làm model thay đổi đánh giá' if items else fallback['summary'], 'items': items,
                'notice': 'Thử thay từng đầu vào, giữ nguyên các đầu vào khác; đây không phải nguyên nhân vật lý hoặc xác suất sự cố.'}
    except Exception:
        LOGGER.warning('Chưa tạo được giải thích cục bộ cho model bất thường', exc_info=True)
        return fallback
