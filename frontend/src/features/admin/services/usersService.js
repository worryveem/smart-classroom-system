import { api } from '../../../services/api/client.js'
import { pageDTO, unwrap, userDTO } from './adminContracts.js'

export const usersService = {
  async list(params, signal) { return pageDTO((await api.get('/api/users', { params, signal })).data, params, userDTO) },
  async get(id, signal) { return unwrap((await api.get(`/api/users/${encodeURIComponent(id)}`, { signal })).data, userDTO) },
  async create(body) { return unwrap((await api.post('/api/users', body)).data, userDTO) },
  async update(id, body) { return unwrap((await api.put(`/api/users/${encodeURIComponent(id)}`, body)).data, userDTO) },
  async remove(id) { return unwrap((await api.delete(`/api/users/${encodeURIComponent(id)}`)).data, () => null) },
}
