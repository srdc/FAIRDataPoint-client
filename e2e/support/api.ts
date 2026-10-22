import fs from 'fs'
import { APIRequestContext, request } from '@playwright/test'
import { env, paths, requirePassword, ensureStateDir } from './env'

/**
 * Thin FDP REST client
 */
export class FdpApi {
  private constructor(private readonly ctx: APIRequestContext, private readonly token: string) {}

  static async login(): Promise<FdpApi> {
    const anon = await request.newContext()
    const res = await anon.post(`${env.apiUrl}/tokens`, {
      data: { email: env.user, password: requirePassword() },
    })
    if (!res.ok()) {
      throw new Error(`Login to ${env.apiUrl} as ${env.user} failed: HTTP ${res.status()}`)
    }
    const { token } = await res.json()
    await anon.dispose()
    const ctx = await request.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    })
    return new FdpApi(ctx, token)
  }

  /** The persistent URL of an entity, e.g. <api>/catalog/<id>. */
  static iri(prefix: string, id: string): string {
    return prefix ? `${env.apiUrl}/${prefix}/${id}` : env.apiUrl
  }

  async getTurtle(prefix: string, id: string): Promise<{ status: number, body: string }> {
    // The root is fetched as <api>/ like the client does: <api> without the slash may be
    // redirected by the front proxy.
    const url = prefix ? FdpApi.iri(prefix, id) : `${env.apiUrl}/`
    const res = await this.ctx.get(url, { headers: { Accept: 'text/turtle' } })
    return { status: res.status(), body: await res.text() }
  }

  async getMeta(prefix: string, id: string): Promise<any> {
    const res = await this.ctx.get(`${FdpApi.iri(prefix, id)}/meta`)
    if (!res.ok()) throw new Error(`GET ${prefix}/${id}/meta: HTTP ${res.status()}`)
    return res.json()
  }

  /** POSTs Turtle and returns the id the FDP minted (last segment of Location). */
  async create(prefix: string, turtle: string): Promise<string> {
    const res = await this.ctx.post(`${env.apiUrl}/${prefix}`, {
      headers: { 'Content-Type': 'text/turtle', Accept: 'text/turtle' },
      data: turtle,
    })
    if (res.status() !== 201) {
      throw new Error(`POST ${prefix}: HTTP ${res.status()}\n${(await res.text()).slice(0, 2000)}`)
    }
    const location = res.headers().location || ''
    const id = location.split('/').pop() as string
    registerCreated(prefix, id)
    return id
  }

  async publish(prefix: string, id: string): Promise<void> {
    const res = await this.ctx.put(`${FdpApi.iri(prefix, id)}/meta/state`, { data: { current: 'PUBLISHED' } })
    if (!res.ok()) throw new Error(`Publishing ${prefix}/${id}: HTTP ${res.status()}`)
  }

  /** Deletes an entity; a 404 (already gone) counts as success. */
  async delete(prefix: string, id: string): Promise<number> {
    const res = await this.ctx.delete(FdpApi.iri(prefix, id))
    return res.status()
  }

  async exists(prefix: string, id: string): Promise<boolean> {
    return (await this.getTurtle(prefix, id)).status === 200
  }

  async currentUser(): Promise<any> {
    const res = await this.ctx.get(`${env.apiUrl}/users/current`)
    if (!res.ok()) throw new Error(`GET /users/current: HTTP ${res.status()}`)
    return res.json()
  }

  async users(): Promise<any[]> {
    const res = await this.ctx.get(`${env.apiUrl}/users`)
    return res.ok() ? res.json() : []
  }

  async deleteUser(uuid: string): Promise<number> {
    return (await this.ctx.delete(`${env.apiUrl}/users/${uuid}`)).status()
  }

  async apiKeys(): Promise<any[]> {
    const res = await this.ctx.get(`${env.apiUrl}/api-keys`)
    return res.ok() ? res.json() : []
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose()
  }

  get bearer(): string {
    return this.token
  }
}

// Created-entity registry

export type CreatedEntry = { prefix: string, id: string, at: string }

export function registerCreated(prefix: string, id: string): void {
  if (!prefix || !id) return
  ensureStateDir()
  const entries = readCreated()
  if (!entries.some((e) => e.prefix === prefix && e.id === id)) {
    entries.push({ prefix, id, at: new Date().toISOString() })
    fs.writeFileSync(paths.created, JSON.stringify(entries, null, 2))
  }
}

export function readCreated(): CreatedEntry[] {
  try {
    return JSON.parse(fs.readFileSync(paths.created, 'utf8'))
  } catch {
    return []
  }
}

export function clearCreated(): void {
  if (fs.existsSync(paths.created)) fs.unlinkSync(paths.created)
}
