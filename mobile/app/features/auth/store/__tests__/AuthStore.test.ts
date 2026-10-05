import type { CurrentUser } from "@/features/auth/types"
import { RootStore } from "@/models/RootStore"
import { clearToken, loadToken, saveToken } from "@/utils/auth"

const user: CurrentUser = {
  id: "u1",
  name: "Owner",
  superAdmin: false,
  propertyId: "p1",
  role: "OWNER",
  memberships: [
    { propertyId: "p1", propertyName: "Shree Dharamshala", role: "OWNER", position: "owner" },
    { propertyId: "p2", propertyName: "Annex", role: "MANAGER", position: "manager" },
  ],
  position: "owner",
  permissions: ["reservations.view", "refund"],
  billingStatus: "active",
  mustChangePassword: false,
}

function fakeApi(overrides: Partial<Record<string, jest.Mock>> = {}) {
  const auth = {
    me: jest.fn(async () => ({ ok: true, data: user })),
    health: jest.fn(async () => ({ ok: true, data: { status: "ok" } })),
    login: jest.fn(async () => ({ ok: true, data: { body: { status: "ok" }, token: "tok" } })),
    sendOtp: jest.fn(async () => ({ ok: true, data: { status: "sent" } })),
    verifyOtp: jest.fn(async () => ({ ok: true, data: { body: { status: "ok" }, token: "tok2" } })),
    switchProperty: jest.fn(async () => ({ ok: true, data: undefined })),
    logout: jest.fn(async () => ({ ok: true, data: undefined })),
    changeMyPassword: jest.fn(async () => ({ ok: true, data: undefined })),
    ...overrides,
  }
  const client = { setToken: jest.fn(), setUnauthorizedHandler: jest.fn() }
  return { auth, client }
}

const make = (api = fakeApi()) => ({ store: RootStore.create({}, { api }), api })

beforeEach(() => clearToken())

describe("AuthStore", () => {
  it("boots signed out without a token", async () => {
    const { store, api } = make()
    await store.auth.boot()
    expect(store.auth.status).toBe("signedOut")
    expect(api.auth.me).not.toHaveBeenCalled()
  })

  it("boots signed in with a saved token", async () => {
    saveToken("saved")
    const { store, api } = make()
    await store.auth.boot()
    expect(api.client.setToken).toHaveBeenCalledWith("saved")
    expect(store.auth.isSignedIn).toBe(true)
    expect(store.auth.propertyName).toBe("Shree Dharamshala")
    expect(store.auth.otherMemberships.map((m) => m.propertyId)).toEqual(["p2"])
  })

  it("says the server is waking only when the warm-up call drags on", async () => {
    let answer: (() => void) | null = null
    const api = fakeApi({
      health: jest.fn(
        () =>
          new Promise((resolve) => {
            answer = () => resolve({ ok: true, data: { status: "ok" } })
          }),
      ),
    })
    const { store } = make(api)
    const warming = store.auth.warmUp(20)
    expect(store.auth.serverWaking).toBe(false)
    await new Promise((r) => setTimeout(r, 60))
    expect(store.auth.serverWaking).toBe(true)
    answer!()
    await warming
    expect(store.auth.serverWaking).toBe(false)
  })

  it("stays quiet when the warm-up call answers quickly", async () => {
    const { store } = make()
    await store.auth.warmUp(200)
    expect(store.auth.serverWaking).toBe(false)
  })

  it("logs in with a password, remembers the token and code", async () => {
    const { store, api } = make()
    const ok = await store.auth.loginWithPassword(
      "srd 1001",
      " Owner@pms.local ",
      "password123",
      "Pixel",
    )
    expect(ok).toBe(true)
    expect(api.auth.login).toHaveBeenCalledWith({
      code: "SRD1001",
      email: "Owner@pms.local",
      password: "password123",
      deviceName: "Pixel",
    })
    expect(loadToken()).toBe("tok")
    expect(store.auth.has("refund")).toBe(true)
    expect(store.auth.has("checkin")).toBe(false)
    expect(store.auth.can("MANAGER")).toBe(true)
  })

  it("keeps the server's message when login fails", async () => {
    const api = fakeApi({
      login: jest.fn(async () => ({
        ok: false,
        problem: {
          kind: "rejected",
          status: 400,
          message: "Wrong property code, email or password",
          temporary: false,
        },
      })),
    })
    const { store } = make(api)
    expect(await store.auth.loginWithPassword("", "a@b.c", "x", "d")).toBe(false)
    expect(store.auth.lastProblem?.message).toBe("Wrong property code, email or password")
    expect(store.auth.status).toBe("booting")
    store.auth.clearProblem()
    expect(store.auth.lastProblem).toBeNull()
  })

  it("signs in by OTP", async () => {
    const { store, api } = make()
    expect(await store.auth.sendOtp("9876543210")).toBe(true)
    expect(await store.auth.verifyOtp("9876543210", "123456", "d")).toBe(true)
    expect(api.auth.verifyOtp).toHaveBeenCalledWith({
      target: "9876543210",
      code: "123456",
      deviceName: "d",
    })
    expect(loadToken()).toBe("tok2")
  })

  it("switches property and reloads me", async () => {
    const { store, api } = make()
    await store.auth.loginWithPassword("", "a@b.c", "x", "d")
    await store.auth.switchProperty("p2")
    expect(api.auth.switchProperty).toHaveBeenCalledWith("p2")
    expect(api.auth.me).toHaveBeenCalledTimes(2)
  })

  it("logs out and forgets the token", async () => {
    const { store, api } = make()
    await store.auth.loginWithPassword("", "a@b.c", "x", "d")
    await store.auth.logout()
    expect(api.auth.logout).toHaveBeenCalled()
    expect(loadToken()).toBeNull()
    expect(store.auth.status).toBe("signedOut")
  })

  it("ends the session on a 401 from me, but not when offline", async () => {
    saveToken("saved")
    const offline = fakeApi({
      me: jest.fn(async () => ({
        ok: false,
        problem: { kind: "cannot-connect", status: null, message: "", temporary: true },
      })),
    })
    const a = make(offline)
    await a.store.auth.boot()
    expect(a.store.auth.status).toBe("signedOut")
    expect(loadToken()).toBe("saved")

    const gone = fakeApi({
      me: jest.fn(async () => ({
        ok: false,
        problem: { kind: "unauthorized", status: 401, message: "", temporary: false },
      })),
    })
    const b = make(gone)
    await b.store.auth.boot()
    expect(loadToken()).toBeNull()
  })

  it("changes the password and refreshes", async () => {
    const { store, api } = make()
    await store.auth.loginWithPassword("", "a@b.c", "x", "d")
    expect(await store.auth.changePassword("old", "newpassword")).toBe(true)
    expect(api.auth.changeMyPassword).toHaveBeenCalledWith({
      currentPassword: "old",
      password: "newpassword",
    })
  })
})
