import { api } from '../../../services/api/client.js'
import { deviceDTO, pageDTO, unwrap } from './adminContracts.js'

export const devicesService = {
  async list(params, signal) { return pageDTO((await api.get('/api/devices', { params, signal })).data, params, deviceDTO) },
  async get(id, signal) { return unwrap((await api.get(`/api/devices/${encodeURIComponent(id)}`, { signal })).data, deviceDTO) },
  async create(body) { return unwrap((await api.post('/api/devices', body)).data, deviceDTO) },
  async update(id, body) { return unwrap((await api.put(`/api/devices/${encodeURIComponent(id)}`, body)).data, deviceDTO) },
  async remove(id) { return unwrap((await api.delete(`/api/devices/${encodeURIComponent(id)}`)).data, () => null) },
}
