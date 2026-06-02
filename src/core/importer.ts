import { parse as parseYaml } from "yaml";
import type { DifyClient } from "./client.js";
import type { StorageBackend } from "../storage/interface.js";
import type { ImportResult, ImportItem, DifyApp } from "./types.js";
import type { ImportOptions } from "../config/types.js";
import { log, formatDuration } from "../utils/logger.js";

type ImportDslMeta = {
  name: string;
  type?: string;
  tags: string[];
};

export async function importApps(
  client: DifyClient,
  storage: StorageBackend,
  opts: ImportOptions & { source?: string }
): Promise<ImportResult> {
  const start = Date.now();
  const created: { name: string; appId: string }[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const overwritten: { name: string; appId: string }[] = [];
  const failed: { name: string; error: string }[] = [];

  // 收集要导入的文件
  const prefix = opts.source ?? "";
  const files = await storage.list(prefix);
  const ymlFiles = files.filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

  if (!ymlFiles.length) {
    log.warn("未找到任何 DSL 文件");
    return { created, skipped, overwritten, failed, duration: Date.now() - start };
  }

  log.info(`找到 ${ymlFiles.length} 个 DSL 文件`);

  // 获取目标实例现有应用（用于冲突检测）
  const existingApps = await client.getAllApps();
  const existingByName = new Map<string, DifyApp>();
  for (const app of existingApps) {
    existingByName.set(app.name.toLowerCase(), app);
  }

  // 解析和规划导入
  const items: ImportItem[] = [];
  for (const file of ymlFiles) {
    // 跳过版本历史文件
    if (file.includes("_versions/")) continue;
    // 跳过状态文件
    if (file.endsWith(".json")) continue;

    try {
      const content = await storage.read(file);
      const meta = extractDslMeta(content, file);
      if (opts.filter && !matchFilter(meta, opts.filter)) {
        continue;
      }

      const existing = existingByName.get(meta.name.toLowerCase());

      let action: "create" | "skip" | "overwrite";
      let reason: string | undefined;

      if (existing) {
        if (opts.onConflict === "overwrite") {
          action = "overwrite";
        } else {
          action = "skip";
          reason = `同名应用已存在 (ID: ${existing.id.slice(0, 8)})`;
        }
      } else {
        action = "create";
      }

      items.push({ name: meta.name, filePath: file, dslContent: content, action, reason });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push({ name: file, error: msg.slice(0, 200) });
    }
  }

  // dry-run: 只输出计划
  if (opts.dryRun) {
    for (const item of items) {
      if (item.action === "create") created.push({ name: item.name, appId: "(dry-run)" });
      else if (item.action === "skip") skipped.push({ name: item.name, reason: item.reason ?? "" });
      else if (item.action === "overwrite") overwritten.push({ name: item.name, appId: "(dry-run)" });
    }
    return { created, skipped, overwritten, failed, duration: Date.now() - start };
  }

  // 执行导入
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    log.progress(i + 1, items.length, `${item.name} (${item.action})`);

    if (item.action === "skip") {
      skipped.push({ name: item.name, reason: item.reason ?? "" });
      continue;
    }

    try {
      const importOpts: { name?: string; appId?: string } = {};
      if (item.action === "overwrite") {
        const existing = existingByName.get(item.name.toLowerCase());
        if (existing) importOpts.appId = existing.id;
      }
      importOpts.name = item.name;

      const result = await client.importAppDSL(item.dslContent, importOpts);

      if (item.action === "overwrite") {
        overwritten.push({ name: item.name, appId: result.appId });
      } else {
        created.push({ name: item.name, appId: result.appId });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push({ name: item.name, error: msg.slice(0, 200) });
      log.warn(`导入失败 ${item.name}: ${msg.slice(0, 100)}`);
    }
  }

  return { created, skipped, overwritten, failed, duration: Date.now() - start };
}

function extractDslMeta(dslContent: string, filePath: string): ImportDslMeta {
  const fallbackName = fileToAppName(filePath);
  try {
    const parsed = parseYaml(dslContent);
    const app = parsed?.app ?? {};
    const rawTags = app?.tags;
    let tags: string[] = [];
    if (Array.isArray(rawTags)) {
      tags = rawTags
        .map((t: unknown) => {
          if (typeof t === "string") return t;
          if (t && typeof t === "object" && "name" in t) {
            const n = (t as { name?: unknown }).name;
            return typeof n === "string" ? n : null;
          }
          return null;
        })
        .filter((v): v is string => !!v);
    }

    return {
      name: typeof app?.name === "string" && app.name ? app.name : fallbackName,
      type: typeof app?.mode === "string" ? app.mode : undefined,
      tags,
    };
  } catch {
    return { name: fallbackName, tags: [] };
  }
}

function fileToAppName(filePath: string): string {
  const filename = filePath.split("/").pop() ?? filePath;
  return filename.replace(/\.ya?ml$/, "").replace(/_\d{8}$/, "").replace(/_current$/, "");
}

function matchFilter(
  meta: ImportDslMeta,
  filter: NonNullable<ImportOptions["filter"]>
): boolean {
  if (filter.names?.length) {
    const nameLower = meta.name.toLowerCase();
    const ok = filter.names.some((n) => nameLower.includes(n.toLowerCase()));
    if (!ok) return false;
  }

  if (filter.types?.length) {
    if (!meta.type) return false;
    const typeLower = meta.type.toLowerCase();
    const ok = filter.types.some((t) => t.toLowerCase() === typeLower);
    if (!ok) return false;
  }

  if (filter.tags?.length) {
    const tagSet = new Set(meta.tags.map((t) => t.toLowerCase()));
    const ok = filter.tags.some((t) => tagSet.has(t.toLowerCase()));
    if (!ok) return false;
  }

  return true;
}
