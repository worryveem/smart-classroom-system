"""Kiểm thử dữ liệu/huấn luyện ADC bằng mẫu tổng hợp, không kích hoạt model thật."""

import unittest

import pandas as pd

from train_occupancy_adc import prepare, train, FEATURES


def fixture():
    rows = []
    for day in range(6):
        for index in range(60):
            level = index % 3
            rows.append({'sensor_id': 'test_sensor', 'sampled_at': pd.Timestamp('2026-10-01', tz='UTC') + pd.Timedelta(days=day, minutes=index*5),
                         'temp': 24 + level, 'ldr_adc': [4000, 2500, 500][level], 'pir_active': int(level != 0),
                         'people_count': [0, 2, 15][level], 'label_source': 'MANUAL'})
    return pd.DataFrame(rows)


class TrainingTests(unittest.TestCase):
    def test_training_splits_by_day_and_preserves_raw_adc(self):
        model, metadata = train(fixture(), 11)
        self.assertTrue(metadata['validation_passed'])
        self.assertFalse(set(metadata['train_days']) & set(metadata['test_days']))
        self.assertEqual(list(model.feature_names_in_), FEATURES)
        self.assertEqual(set(model.classes_), {'EMPTY', 'LOW', 'CROWDED'})
        self.assertEqual(metadata['crowded_min'], 11)

    def test_refuses_unlabeled_or_insufficient_data(self):
        for data in (fixture().head(10), fixture().assign(label_source='PIR'), fixture().assign(people_count=0)):
            with self.subTest(size=len(data)):
                with self.assertRaises(ValueError):
                    train(data, 11)

    def test_rejects_invalid_values_and_conflicting_duplicate(self):
        for key, value in [('ldr_adc', 4096), ('ldr_adc', 2.5), ('people_count', -1), ('sampled_at', None), ('temp', float('nan'))]:
            data = fixture(); data.loc[0, key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                prepare(data, 11)
        data = fixture(); duplicate = data.iloc[[0]].assign(people_count=10)
        with self.assertRaises(ValueError):
            prepare(pd.concat([data, duplicate]), 11)

    def test_near_duplicates_do_not_inflate_sample_counts(self):
        data = fixture().head(10)
        repeated = pd.concat([data.assign(sampled_at=data['sampled_at'] + pd.Timedelta(seconds=i)) for i in range(30)])
        with self.assertRaisesRegex(ValueError, 'Chưa đủ dữ liệu'):
            prepare(repeated, 11)


if __name__ == '__main__':
    unittest.main()
