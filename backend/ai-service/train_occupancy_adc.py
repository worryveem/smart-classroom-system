"""Huấn luyện model hiện diện bằng ADC và số người được quan sát thực tế."""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import balanced_accuracy_score, classification_report, f1_score
from sklearn.model_selection import GroupShuffleSplit

FEATURES = ['temp', 'ldr_adc', 'pir_active', 'hour']
LABELS = ['EMPTY', 'LOW', 'CROWDED']
ROOT = Path(__file__).resolve().parent
ACTIVE_MODEL = ROOT / 'local-occupancy/active_model.joblib'


def prepare(data, crowded_min):
    required = ['sensor_id', 'sampled_at', 'temp', 'ldr_adc', 'pir_active', 'people_count', 'label_source']
    if not set(required).issubset(data.columns):
        raise ValueError('CSV thiếu cột bắt buộc; hãy xuất từ trang AI.')
    if data.empty or not data['label_source'].eq('MANUAL').all():
        raise ValueError('Chỉ dùng mẫu có số người được quan sát thủ công.')
    data = data.copy()
    if data['sensor_id'].nunique(dropna=False) != 1 or data['sensor_id'].isna().any() or data['sensor_id'].astype(str).str.strip().eq('').any():
        raise ValueError('Một model chỉ huấn luyện từ một cảm biến/phòng có cùng cách lắp LDR.')
    data['sampled_at'] = pd.to_datetime(data['sampled_at'], utc=True, errors='raise', format='ISO8601')
    if data['sampled_at'].isna().any():
        raise ValueError('Mẫu thiếu thời gian thu thập.')
    for column, lo, hi in [('temp', -40, 125), ('ldr_adc', 0, 4095), ('pir_active', 0, 1), ('people_count', 0, 1000)]:
        data[column] = pd.to_numeric(data[column], errors='raise')
        if not np.isfinite(data[column]).all() or not data[column].between(lo, hi).all():
            raise ValueError(f'Cột {column} có giá trị thiếu hoặc ngoài phạm vi.')
        if column != 'temp' and not (data[column] % 1 == 0).all():
            raise ValueError(f'Cột {column} phải là số nguyên.')
    if data.groupby(['sensor_id', 'sampled_at'])['people_count'].nunique().gt(1).any():
        raise ValueError('Có nhãn mâu thuẫn cho cùng mẫu cảm biến; cần sửa dữ liệu trước.')
    data = data.drop_duplicates(['sensor_id', 'sampled_at'])
    # Giảm mẫu gần trùng: tối đa một mẫu mỗi 5 phút, không ngẫu nhiên trộn các mẫu sát nhau.
    data['bucket'] = data['sampled_at'].dt.floor('5min')
    data = data.sort_values('sampled_at').drop_duplicates(['sensor_id', 'bucket'], keep='last').copy()
    local = data['sampled_at'].dt.tz_convert('Asia/Ho_Chi_Minh')
    data['hour'] = local.dt.hour
    data['day'] = local.dt.strftime('%Y-%m-%d')
    data['label'] = np.where(data['people_count'] == 0, 'EMPTY', np.where(data['people_count'] < crowded_min, 'LOW', 'CROWDED'))
    counts = data['label'].value_counts()
    if data['day'].nunique() < 3 or any(counts.get(label, 0) < 30 for label in LABELS):
        raise ValueError('Chưa đủ dữ liệu: cần ít nhất 3 ngày và 30 mẫu cách nhau 5 phút cho mỗi mức trống/ít/nhiều.')
    return data


def train(data, crowded_min):
    if not 2 <= crowded_min <= 1000:
        raise ValueError('Mốc nhiều người phải từ 2 đến 1000.')
    data = prepare(data, crowded_min)
    split = None
    for train_index, test_index in GroupShuffleSplit(n_splits=100, test_size=0.25, random_state=42).split(data, groups=data['day']):
        train_counts = data.iloc[train_index]['label'].value_counts()
        test_counts = data.iloc[test_index]['label'].value_counts()
        if all(train_counts.get(label, 0) >= 20 and test_counts.get(label, 0) >= 5 for label in LABELS):
            split = train_index, test_index
            break
    if split is None:
        raise ValueError('Chưa thể tách ngày kiểm thử có đủ cả ba mức; cần thu thêm các mức trên nhiều ngày.')
    training, testing = (data.iloc[index] for index in split)
    model = RandomForestClassifier(n_estimators=200, min_samples_leaf=2, class_weight='balanced', random_state=42, n_jobs=1)
    model.fit(training[FEATURES], training['label'])
    predicted = model.predict(testing[FEATURES])
    baseline = np.repeat(training['label'].mode().iloc[0], len(testing))
    score = f1_score(testing['label'], predicted, labels=LABELS, average='macro', zero_division=0)
    baseline_score = f1_score(testing['label'], baseline, labels=LABELS, average='macro', zero_division=0)
    report = classification_report(testing['label'], predicted, labels=LABELS, output_dict=True, zero_division=0)
    balanced = balanced_accuracy_score(testing['label'], predicted)
    passed = score >= 0.75 and score >= baseline_score + 0.05 and balanced >= 0.65 and all(report[label]['recall'] >= 0.6 for label in LABELS)
    metadata = {
        'schema': 'occupancy-adc-v1', 'features': FEATURES, 'labels': LABELS,
        'sensor_id': str(data['sensor_id'].iloc[0]), 'crowded_min': crowded_min,
        'timezone': 'Asia/Ho_Chi_Minh', 'trained_at': datetime.now(timezone.utc).isoformat(),
        'sklearn_version': sklearn.__version__, 'train_days': sorted(training['day'].unique().tolist()),
        'test_days': sorted(testing['day'].unique().tolist()), 'train_samples': len(training), 'test_samples': len(testing),
        'label_counts': {label: int((data['label'] == label).sum()) for label in LABELS},
        'macro_f1': float(score), 'baseline_macro_f1': float(baseline_score),
        'balanced_accuracy': float(balanced), 'classification_report': report, 'validation_passed': bool(passed),
        'notice': 'Đánh giá trên ngày riêng; chưa chứng minh độ chính xác cho phòng khác hoặc sau thay đổi cảm biến.',
    }
    model.occupancy_metadata_ = metadata
    return model, metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv', required=True, type=Path)
    parser.add_argument('--crowded-min', required=True, type=int, help='Số người tối thiểu cho mức nhiều; mức ít là 1 đến mốc này trừ 1')
    parser.add_argument('--activate', action='store_true', help='Kích hoạt model nếu đạt ngưỡng kiểm thử; cần khởi động lại Python')
    args = parser.parse_args()
    try:
        model, metadata = train(pd.read_csv(args.csv), args.crowded_min)
    except (ValueError, KeyError) as error:
        parser.exit(2, str(error) + '\n')
    metadata['dataset_sha256'] = hashlib.sha256(args.csv.read_bytes()).hexdigest()
    run = ROOT / 'local-occupancy/runs' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    run.mkdir(parents=True, exist_ok=False)
    joblib.dump(model, run / 'candidate_model.joblib')
    (run / 'evaluation.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    if args.activate:
        if not metadata['validation_passed']:
            parser.exit(3, f'Model chưa đạt kiểm thử; không kích hoạt. Báo cáo: {run / "evaluation.json"}\n')
        temporary = ACTIVE_MODEL.with_suffix('.tmp')
        joblib.dump(model, temporary)
        temporary.replace(ACTIVE_MODEL)
    print(json.dumps({'run': str(run), 'validation_passed': metadata['validation_passed'], 'activated': args.activate}, ensure_ascii=True))


if __name__ == '__main__':
    main()
