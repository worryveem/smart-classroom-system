"""API thử nghiệm: suy luận và gợi ý, không gửi lệnh điều khiển."""

import logging
import warnings
from contextlib import asynccontextmanager
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sklearn.exceptions import InconsistentVersionWarning

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
    return {"status": "ready" if all(states.values()) else "degraded", "models": states}


@app.post("/predict/anomaly")
def anomaly(data: AnomalyInput):
    model = get_model("anomaly")
    frame = pd.DataFrame([data.model_dump()], columns=FEATURES["anomaly"])
    try:
        label = int(model.predict(frame)[0])
        score = float(model.decision_function(frame)[0])
        if label not in (-1, 1):
            raise ValueError("Nhãn bất thường không hợp lệ")
    except Exception:
        LOGGER.exception("Suy luận anomaly thất bại")
        raise HTTPException(503, "Không thể suy luận bằng model hiện tại.")
    return {
        "experimental": True,
        "label": "ANOMALY" if label == -1 else "NORMAL",
        "decision_score": score,
        "suggestion": "Dữ liệu có dấu hiệu khác thường; nên kiểm tra điều kiện phòng và cảm biến."
        if label == -1 else "Chưa phát hiện mẫu khác thường theo mô hình thử nghiệm.",
        "notice": "Kết quả tham khảo; điểm quyết định không phải xác suất sự cố. light phải là boolean, không phải lux.",
    }


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
    notices = ["Nhãn mô hình không đại diện sĩ số lớp. Cần xác minh cách tính mean trước khi dùng dữ liệu ESP."]
    if not 24.89 <= data.temp_mean <= 26.8 or data.light_mean > 193.75:
        notices.append("Đầu vào nằm ngoài phạm vi nhiệt độ hoặc ánh sáng của CSV huấn luyện đã kiểm tra.")
    return {
        "experimental": True,
        "label": label,
        "suggestion": "Dữ liệu gợi ý phòng có thể đang được sử dụng; hãy đối chiếu thực tế."
        if label != "EMPTY" else "Dữ liệu gợi ý mức hiện diện thấp; hãy đối chiếu thực tế trước khi kết luận phòng trống.",
        "notices": notices,
    }
