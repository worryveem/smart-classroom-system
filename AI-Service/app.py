"""API thử nghiệm: suy luận và gợi ý, không gửi lệnh điều khiển."""

import logging
import math
import warnings
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sklearn.exceptions import InconsistentVersionWarning
from train_occupancy_adc import ACTIVE_MODEL, FEATURES as ADC_FEATURES, LABELS as ADC_LABELS
from anomaly_explanation import explain

ROOT = Path(__file__).resolve().parent
LOGGER = logging.getLogger(__name__)
MODEL_FILES = {
    "anomaly": ROOT / "AI1-Service/model/anomaly_model.pkl",
    "occupancy": ROOT / "AI2_Occupancy/AI2_Occupancy/model/occupancy_model.pkl",
}
FEATURES = {
    "anomaly": ["temp", "humidity", "light", "motion"],
    "occupancy": ["temp_mean", "light_mean", "pir_active", "hour"],
}


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class AnomalyInput(Input):
    temp: float = Field(strict=True, ge=-40, le=125)
    humidity: float = Field(strict=True, ge=0, le=100)
    light: StrictBool
    motion: StrictBool


class OccupancyInput(Input):
    temp_mean: float = Field(strict=True, ge=-40, le=125)
    light_mean: float = Field(strict=True, ge=0)
    pir_active: int = Field(strict=True, ge=0, le=1)
    hour: int = Field(strict=True, ge=0, le=23)


class OccupancyDemoInput(Input):
    sample_label: Literal['EMPTY', 'LOW', 'CROWDED']


class LiveOccupancyInput(Input):
    temperatures: list[Annotated[float, Field(strict=True, ge=-40, le=125)]] = Field(min_length=1, max_length=4)
    lights: list[Annotated[float, Field(strict=True, ge=0)]] = Field(min_length=1, max_length=4)
    pir_values: list[Annotated[int, Field(strict=True, ge=0, le=1)]] = Field(min_length=1, max_length=2)
    hour: int = Field(strict=True, ge=0, le=23)
    light_source: Literal['CALIBRATED_LUX', 'ESTIMATED_LUX', 'LDR_DEMO_LUX', 'UNVERIFIED_LUX']


class AdcAnomalyInput(Input):
    temp: float = Field(strict=True, ge=-40, le=125)
    humidity: float = Field(strict=True, ge=0, le=100)
    motion: StrictBool
    ldr_adc: int = Field(strict=True, ge=0, le=4095)
    threshold: int = Field(strict=True, ge=1, le=4094)
    high_is_bright: StrictBool = False


class AdcOccupancyInput(Input):
    sensor_id: str = Field(strict=True, min_length=1, max_length=100)
    temp: float = Field(strict=True, ge=-40, le=125)
    ldr_adc: int = Field(strict=True, ge=0, le=4095)
    motion: StrictBool
    hour: int = Field(strict=True, ge=0, le=23)


def adc_to_light(adc: int, threshold: int, high_is_bright: bool) -> bool:
    return adc >= threshold if high_is_bright else adc < threshold


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.models = {}
    for name, path in MODEL_FILES.items():
        try:
            # Chỉ nạp các artifact cố định trong dự án; pickle có thể thực thi mã.
            with warnings.catch_warnings():
                warnings.simplefilter("error", InconsistentVersionWarning)
                model = joblib.load(path)
            if list(model.feature_names_in_) != FEATURES[name]:
                raise ValueError("Thứ tự đặc trưng của model không khớp API")
            app.state.models[name] = model
        except Exception:
            LOGGER.exception("Không thể nạp model %s", name)
    if ACTIVE_MODEL.is_file():
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", InconsistentVersionWarning)
                model = joblib.load(ACTIVE_MODEL)
            metadata = model.occupancy_metadata_
            if (list(model.feature_names_in_) != ADC_FEATURES
                    or metadata.get('schema') != 'occupancy-adc-v1'
                    or metadata.get('validation_passed') is not True
                    or set(model.classes_) != set(ADC_LABELS)):
                raise ValueError('Model ADC chưa đúng schema hoặc chưa đạt kiểm thử')
            app.state.models['occupancy_adc'] = model
        except Exception:
            LOGGER.exception('Không thể nạp model hiện diện ADC của phòng')
    yield
    app.state.models.clear()


app = FastAPI(title="Gợi ý AI lớp học — thử nghiệm", lifespan=lifespan)


def get_model(name):
    model = app.state.models.get(name)
    if model is None:
        raise HTTPException(503, "Model chưa sẵn sàng; kiểm tra artifact và phiên bản thư viện trong log.")
    return model


@app.get("/health")
def health():
    states = {name: name in app.state.models for name in MODEL_FILES}
    status = "ready" if all(states.values()) else "degraded"
    states['occupancy_adc'] = 'occupancy_adc' in app.state.models
    local_model = app.state.models.get('occupancy_adc')
    return {"status": status, "models": states,
            "occupancy_adc_sensor_id": local_model.occupancy_metadata_['sensor_id'] if local_model is not None else None}


@app.post('/predict/occupancy/adc')
def occupancy_adc(data: AdcOccupancyInput):
    model = get_model('occupancy_adc')
    metadata = model.occupancy_metadata_
    if data.sensor_id != metadata['sensor_id']:
        raise HTTPException(422, 'Model ADC không được huấn luyện cho cảm biến/phòng này.')
    frame = pd.DataFrame([{'temp': data.temp, 'ldr_adc': data.ldr_adc,
                           'pir_active': int(data.motion), 'hour': data.hour}], columns=ADC_FEATURES)
    try:
        label = str(model.predict(frame)[0])
        if label not in ADC_LABELS:
            raise ValueError('Nhãn hiện diện ADC không hợp lệ')
    except Exception:
        LOGGER.exception('Suy luận hiện diện ADC thất bại')
        raise HTTPException(503, 'Chưa dự đoán được mức hiện diện. Vui lòng thử lại.')
    return {'experimental': True, 'label': label,
            'suggestion': {'EMPTY': 'AI dự đoán phòng có thể đang trống.',
                           'LOW': 'AI dự đoán phòng có thể đang có ít người.',
                           'CROWDED': 'AI dự đoán phòng có thể đang có nhiều người.'}[label],
            'notice': 'Cần đối chiếu thực tế; đây là mức hiện diện ước đoán, không phải số người được đếm.',
            'crowded_min': metadata['crowded_min'], 'model_version': metadata['trained_at']}


@app.post("/predict/anomaly")
def anomaly(data: AnomalyInput):
    model = get_model("anomaly")
    frame = pd.DataFrame([data.model_dump()], columns=FEATURES["anomaly"])
    try:
        label = int(model.predict(frame)[0])
        score = float(model.decision_function(frame)[0])
        if label not in (-1, 1) or not math.isfinite(score):
            raise ValueError("Nhãn bất thường không hợp lệ")
    except Exception:
        LOGGER.exception("Suy luận anomaly thất bại")
        raise HTTPException(503, "Không thể suy luận bằng model hiện tại.")
    return {
        "experimental": True,
        "label": "ANOMALY" if label == -1 else "NORMAL",
        "decision_score": score,
        "explanation": explain(model, data.model_dump(), label, score),
        "suggestion": "Dữ liệu có dấu hiệu khác thường; nên kiểm tra điều kiện phòng và cảm biến."
        if label == -1 else "Chưa phát hiện mẫu khác thường theo mô hình thử nghiệm.",
        "notice": "Kết quả tham khảo; điểm quyết định không phải xác suất sự cố. light phải là boolean, không phải lux.",
    }


@app.post("/predict/anomaly/adc")
def anomaly_adc(data: AdcAnomalyInput):
    light = adc_to_light(data.ldr_adc, data.threshold, data.high_is_bright)
    result = anomaly(AnomalyInput(temp=data.temp, humidity=data.humidity, light=light, motion=data.motion))
    result["light_conversion"] = {
        "adc": data.ldr_adc, "threshold": data.threshold,
        "high_is_bright": data.high_is_bright, "light": light,
    }
    result["notice"] = (
        "Thử nghiệm: quy ước light=True là sáng, chưa xác minh tương đương dữ liệu huấn luyện. "
        "Ngưỡng ADC do người dùng chọn; không quy đổi lux. Điểm quyết định không phải xác suất sự cố."
    )
    if data.ldr_adc in (0, 4095):
        result["notice"] += " ADC đang ở giới hạn thang đo; nên kiểm tra cảm biến."
    return result


@app.post("/predict/occupancy")
def occupancy(data: OccupancyInput):
    model = get_model("occupancy")
    frame = pd.DataFrame([data.model_dump()], columns=FEATURES["occupancy"])
    try:
        label = str(model.predict(frame)[0])
        if label not in ("EMPTY", "LOW", "CROWDED"):
            raise ValueError("Nhãn hiện diện không hợp lệ")
    except Exception:
        LOGGER.exception("Suy luận occupancy thất bại")
        raise HTTPException(503, "Không thể suy luận bằng model hiện tại.")
    notices = ["Nhãn gốc tương ứng 0 người, 1 người và từ 2 người; dự đoán không phải kết quả đếm người hay sĩ số lớp."]
    if not 24.89 <= data.temp_mean <= 26.8 or data.light_mean > 193.75:
        notices.append("Đầu vào nằm ngoài phạm vi nhiệt độ hoặc ánh sáng của CSV huấn luyện đã kiểm tra.")
    return {
        "experimental": True,
        "label": label,
        "suggestion": "Dữ liệu gợi ý phòng có thể đang được sử dụng; hãy đối chiếu thực tế."
        if label != "EMPTY" else "Dữ liệu gợi ý mức hiện diện thấp; hãy đối chiếu thực tế trước khi kết luận phòng trống.",
        "notices": notices,
    }


@app.post('/predict/occupancy/live')
def occupancy_live(data: LiveOccupancyInput):
    features = OccupancyInput(temp_mean=sum(data.temperatures) / len(data.temperatures),
                              light_mean=sum(data.lights) / len(data.lights),
                              pir_active=max(data.pir_values), hour=data.hour)
    result = occupancy(features)
    notices = list(result['notices'])
    if len(data.temperatures) != 4 or len(data.lights) != 4 or len(data.pir_values) != 2:
        notices.append('Đang dùng cấu hình ít cảm biến hơn cấu hình huấn luyện 4 nhiệt độ, 4 ánh sáng và 2 PIR; độ chính xác tại phòng chưa được kiểm chứng.')
    estimated = data.light_source != 'CALIBRATED_LUX'
    if estimated:
        notices.append('Ánh sáng là giá trị quy đổi/chưa hiệu chuẩn; kết quả hiện diện chỉ mang tính ước tính.')
    result.update({'data_source': 'CURRENT_SENSOR', 'features': features.model_dump(),
                   'light_source': data.light_source, 'estimated_light': estimated,
                   'sensor_counts': {'temperature': len(data.temperatures), 'light': len(data.lights), 'pir': len(data.pir_values)},
                   'out_of_training_range': not 24.89 <= features.temp_mean <= 26.8 or features.light_mean > 193.75,
                   'notice': 'Ước tính hiện diện từ số đo hiện tại; cần đối chiếu thực tế, không dùng để đếm người.',
                   'notices': notices})
    return result


@app.post('/predict/occupancy/demo')
def occupancy_demo(data: OccupancyDemoInput):
    get_model('occupancy')
    try:
        samples = pd.read_csv(ROOT / 'AI2_Occupancy/AI2_Occupancy/data/cleaned_data.csv')
        row = samples.loc[samples['occupancy_label'] == data.sample_label].iloc[0]
        features = OccupancyInput(temp_mean=float(row['temp_mean']), light_mean=float(row['light_mean']),
                                  pir_active=int(row['pir_active']), hour=int(row['hour']))
    except Exception:
        LOGGER.exception('Không đọc được bộ mẫu hiện diện')
        raise HTTPException(503, 'Chưa đọc được dữ liệu mẫu của model hiện diện.')
    prediction = occupancy(features)
    prediction['data_source'] = 'SAMPLE_DATASET'
    prediction['sample'] = features.model_dump()
    prediction['sample_label'] = data.sample_label
    prediction['notice'] = 'Phân tích dữ liệu mẫu có sẵn, không phản ánh tình trạng phòng 101 hiện tại. Không dùng để đếm người.'
    return prediction
