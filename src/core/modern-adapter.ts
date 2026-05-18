import type { DifyAdapter, AdapterConfig } from "./adapter.js";
import type { DifyApp, DifyWorkspace, WorkflowVersion } from "./types.js";
import { HttpClient } from "./http.js";

export class ModernAdapter implements DifyAdapter {
  private http: HttpClient;
  private email?: string;
  private password?: string;
  private token?: string;

  constructor(config: AdapterConfig) {
    this.http = new HttpClient(config.baseUrl, config.timeout, config.maxRetries);
    this.email = config.email;
    this.password = config.password;
    this.token = config.token;
  }

  async login(): Promise<void> {
    if (this.token) {
      this.http.setHeader("authorization", `Bearer ${this.token}`);
      return;
    }
    if (!this.email || !this.password) {
      throw new Error("Modern adapter: 需要 token 或 email+password");
    }

    const encodedPassword = Buffer.from(this.password).toString("base64");
    const res = await this.http.post("/login", {
      email: this.email,
      password: encodedPassword,
      remember_me: false,
    });

    const body = res.body as { result?: string; data?: { access_token?: string } };

    // Modern 版本 token 可能在 cookie 中，也可能在 response body 中（兼容过渡期）
    const cookieToken = this.http.getCookie("access_token");
    const bodyToken = body.data?.access_token;
    this.token = cookieToken ?? bodyToken;

    if (this.token && !cookieToken) {
      this.http.setHeader("authorization", `Bearer ${this.token}`);
    }

    // 设置 CSRF token
    const csrfToken = this.http.getCookie("csrf_token");
    if (csrfToken) {
      this.http.setHeader("x-csrf-token", csrfToken);
    }

    if (!this.token && !cookieToken) {
      throw new Error("登录失败：无法获取认证凭据");
    }
  }

  async getApps(page: number, limit: number) {
    const res = await this.http.get("/apps", {
      page: String(page),
      limit: String(limit),
    });
    const body = res.body as { data?: DifyApp[]; total?: number; has_more?: boolean };
    return {
      data: body.data ?? [],
      total: body.total ?? 0,
      hasMore: body.has_more ?? false,
    };
  }

  async exportAppDSL(appId: string, includeSecret: boolean, workflowId?: string) {
    const params: Record<string, string> = {
      include_secret: String(includeSecret),
    };
    if (workflowId) params.workflow_id = workflowId;

    const res = await this.http.get(`/apps/${appId}/export`, params);
    const body = res.body as { data?: string };
    return body.data ?? "";
  }

  async importAppDSL(dslContent: string, opts?: { name?: string; appId?: string }) {
    const payload: Record<string, unknown> = {
      mode: "YAML_CONTENT",
      yaml_content: dslContent,
    };
    if (opts?.name) payload.name = opts.name;
    if (opts?.appId) payload.app_id = opts.appId;

    const res = await this.http.post("/apps/imports", payload);
    const body = res.body as {
      id?: string;
      status?: string;
      app_id?: string;
    };

    // 如果状态是 PENDING，需要 confirm
    if (body.status === "PENDING" && body.id) {
      const confirmRes = await this.http.post(`/apps/imports/${body.id}/confirm`);
      const confirmBody = confirmRes.body as { app_id?: string; status?: string };
      return {
        appId: confirmBody.app_id ?? body.app_id ?? "",
        status: confirmBody.status ?? "completed",
      };
    }

    return {
      appId: body.app_id ?? "",
      status: body.status ?? "completed",
    };
  }

  async getWorkflowVersions(appId: string): Promise<WorkflowVersion[]> {
    try {
      const res = await this.http.get(`/apps/${appId}/workflows`, {
        page: "1",
        limit: "100",
        named_only: "false",
      });
      const body = res.body as { items?: WorkflowVersion[] };
      return body.items ?? [];
    } catch {
      return [];
    }
  }

  async getAppTags(appId: string): Promise<string[]> {
    try {
      const res = await this.http.get(`/apps/${appId}`);
      const body = res.body as { tags?: { name: string }[] };
      return (body.tags ?? []).map((t) => t.name);
    } catch {
      return [];
    }
  }

  async switchWorkspace(workspaceId: string): Promise<void> {
    await this.http.post("/workspaces/switch", { tenant_id: workspaceId });
  }

  async getWorkspaces(): Promise<DifyWorkspace[]> {
    try {
      const res = await this.http.get("/workspaces");
      const body = res.body as { data?: DifyWorkspace[] } | DifyWorkspace[];
      if (Array.isArray(body)) return body;
      return (body as { data?: DifyWorkspace[] }).data ?? [];
    } catch {
      return [];
    }
  }
}
