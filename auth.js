/* 散客看板：身份/角色/CSRF 以 Worker 为准；浏览器不保存密码或会话令牌。
 * 帽子云同源 /api（网关反代）。GitHub Pages 及其它静态域名改打
 * https://tourism-kb-id-ocr.qinfan079325.workers.dev/api （credentials + CSRF）。
 * 账号管理对齐导游报账：用户名 / 密码 / 角色（普通用户|管理员）/ 添加人员，表格删除。
 * 不移植导游名单。普通用户对应 Worker role=staff。创建账号不强制 12 位。 */
const MingdanAuth = (function () {
  const WORKER_ORIGIN = "https://tourism-kb-id-ocr.qinfan079325.workers.dev";
  const BOOTSTRAP_ADMIN = "秦凡";

  let session = null;
  let csrf = "";
  let onLogin = null;
  let loggingIn = false;
  let changePromise = null;

  function hostname() {
    try { return String(location.hostname || ""); } catch (_) { return ""; }
  }
  function base() {
    const host = hostname();
    if (/(^|\.)maozi\.io$/i.test(host)) return "/api";
    try {
      if (new URL(WORKER_ORIGIN).hostname === host) return "/api";
    } catch (_) {}
    return WORKER_ORIGIN + "/api";
  }
  function authHeaders() {
    return csrf ? { "X-CSRF-Token": csrf } : {};
  }
  function message(d, status) {
    const byCode = {
      username_or_password_incorrect: "用户名或密码不正确",
      invalid_credentials: "用户名或密码不正确",
      must_change_password: "请先修改初始密码",
      completed_admin_only: "仅管理员可查看已完团",
      csrf_invalid: "会话校验已失效，请刷新后重试",
      rate_limited: "尝试次数太多，请稍后再试",
      password_too_weak: "新密码至少12位，需含字母和数字",
      forbidden: "没有权限执行这个操作",
      proxy_missing: "登录服务尚未接通，请联系管理员",
      network_error: "网络异常，请稍后重试",
    };
    return byCode[d && d.error] || (d && (d.message || d.error)) || ("服务请求失败（" + status + "）");
  }
  async function request(path, opts) {
    try {
      return await fetch(base() + path, opts);
    } catch (e) {
      return { ok: false, status: 0, headers: new Headers(), json: async () => ({ error: "network_error" }) };
    }
  }
  function captureCsrf(res, d) {
    const next = (res && res.headers && res.headers.get("X-CSRF-Token")) || (d && (d.csrf || d.csrf_token || d.csrfToken)) || "";
    if (next) csrf = next;
  }
  function showGateError(text) {
    const err = document.getElementById("authErr");
    if (!err || !text) return;
    err.textContent = text;
    err.classList.remove("hidden");
  }
  async function api(path, opts) {
    opts = Object.assign({}, opts || {});
    const method = String(opts.method || "GET").toUpperCase();
    opts.method = method;
    opts.credentials = "include";
    opts.headers = Object.assign({ Accept: "application/json" }, authHeaders(), opts.headers || {});
    if (opts.body && typeof opts.body !== "string") {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    const res = await request(path, opts);
    const d = await res.json().catch(() => ({ error: "proxy_missing" }));
    captureCsrf(res, d);
    const credentialFail = d && (d.error === "username_or_password_incorrect" || d.error === "invalid_credentials");
    if (!credentialFail && (res.status === 401 || d.error === "session_expired")) {
      const had = !!session;
      session = null;
      csrf = "";
      lockUI();
      if (had) showGateError("登录已失效，请重新登录");
      throw new Error("登录已失效，请重新登录");
    }
    if (res.status === 403 && (d.must_change_password || d.error === "must_change_password") && !opts.skipPasswordGate) {
      await promptPasswordChange();
      return api(path, opts);
    }
    if (!res.ok || d.ok === false) throw new Error(message(d, res.status));
    return d;
  }
  function injectStyles() {
    if (document.getElementById("mingdanAuthStyles")) return;
    const style = document.createElement("style");
    style.id = "mingdanAuthStyles";
    style.textContent = [
      ".nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center}",
      ".nav a{background:#1a2332;border:1px solid #2d3a4f;border-radius:999px;padding:6px 14px;font-size:13px;color:#9aabbf;text-decoration:none}",
      ".nav a.active{background:#1e3a5f;border-color:#3b82f6;color:#93c5fd;font-weight:650}",
      ".auth-who{color:#9aabbf;font-size:12px;margin-left:auto;align-self:center}",
      ".btn-logout{background:transparent;border:1px solid #2d3a4f;color:#9aabbf;border-radius:999px;padding:5px 12px;font-size:12px;cursor:pointer}",
      ".btn-logout:hover{color:#e8eef7;border-color:#9aabbf}",
      "#accountAdmin{margin:22px 0;padding:16px 18px;border:1px solid #3b82f6;border-radius:14px;background:#1a2332}",
      "#accountAdmin h2{margin:0 0 6px;font-size:1.2rem;font-weight:750}",
      "#accountAdmin h3{margin:0 0 10px;font-size:16px;color:#93c5fd}",
      ".admin-hint{color:#9aabbf;font-size:13px;margin:0 0 12px;line-height:1.5}",
      ".admin-card{background:#121a24;border:1px solid #2d3a4f;border-radius:12px;padding:14px}",
      ".admin-form{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:flex-end;margin:0 0 12px}",
      ".admin-form .field{display:flex;flex-direction:column;min-width:140px;flex:1 1 160px;max-width:280px}",
      ".admin-form label{font-size:12px;font-weight:700;color:#9aabbf;margin:0 0 4px}",
      "#accountAdmin input,#accountAdmin select{width:100%;max-width:none;background:#0f1419;color:#e8eef7;border:1px solid #2d3a4f;border-radius:10px;padding:8px 10px;font-size:14px;min-height:38px;margin:0;box-sizing:border-box}",
      "#accountAdmin input:focus,#accountAdmin select:focus{outline:none;border-color:#3b82f6}",
      "#accountAdmin .admin-add-btn{background:#1d4ed8;border:1px solid #2563eb;color:#fff;border-radius:10px;padding:8px 16px;min-height:38px;font-size:14px;font-weight:750;cursor:pointer}",
      "#accountAdmin .admin-add-btn:disabled{opacity:.6;cursor:wait}",
      ".admin-user-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}",
      ".admin-user-table th,.admin-user-table td{padding:8px 6px;border-bottom:1px solid #2d3a4f;text-align:left;vertical-align:middle}",
      ".admin-user-table th{color:#9aabbf;font-weight:650}",
      ".role-admin{color:#fbbf24;font-weight:800}",
      ".role-user{color:#93c5fd;font-weight:700}",
      "#accountAdmin .admin-del{background:transparent;border:1px solid #ef4444;color:#fecaca;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer}",
      "#adminNotice{margin:8px 0;color:#93c5fd;font-size:13px;min-height:1.2em}",
      ".admin-only[hidden],#accountAdmin[hidden],[hidden]{display:none!important}",
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }
  function setAdminOnlyVisible(isAdmin) {
    document.querySelectorAll(".admin-only").forEach((el) => {
      el.hidden = !isAdmin;
      if (!isAdmin) el.style.setProperty("display", "none", "important");
      else el.style.removeProperty("display");
    });
    const admin = document.getElementById("accountAdmin");
    if (admin) {
      admin.hidden = !isAdmin;
      if (!isAdmin) admin.style.setProperty("display", "none", "important");
      else admin.style.removeProperty("display");
    }
  }
  function unlockUI(user) {
    session = user;
    document.body.classList.remove("locked");
    const gate = document.getElementById("authGate");
    if (gate) gate.classList.add("hidden");
    const who = document.getElementById("authWho");
    const isAdmin = !!(user && user.role === "admin");
    if (who) {
      const name = user && user.username ? user.username : "";
      who.textContent = name ? ("当前：" + name + (isAdmin ? "（管理员）" : "")) : "";
    }
    setAdminOnlyVisible(isAdmin);
    const admin = document.getElementById("accountAdmin");
    if (isAdmin && admin && !admin.dataset.bound) {
      admin.dataset.bound = "1";
      bindAdmin();
    }
  }
  function lockUI() {
    document.body.classList.add("locked");
    const gate = document.getElementById("authGate");
    if (gate) gate.classList.remove("hidden");
    const pass = document.getElementById("authPass");
    if (pass) pass.value = "";
    setAdminOnlyVisible(false);
  }
  async function login(event) {
    if (event) event.preventDefault();
    if (loggingIn) return;
    loggingIn = true;
    const btn = document.querySelector('#authForm button[type="submit"]');
    if (btn) btn.disabled = true;
    const err = document.getElementById("authErr");
    if (err) {
      err.textContent = "";
      err.classList.add("hidden");
    }
    try {
      const username = document.getElementById("authUser").value.trim();
      const password = document.getElementById("authPass").value;
      const d = await api("/login", { method: "POST", body: { username, password } });
      if (!d.user) throw new Error("登录服务未返回账号信息");
      captureCsrf(null, d);
      const pass = document.getElementById("authPass");
      if (pass) pass.value = "";
      session = d.user;
      if (d.user.must_change_password) await promptPasswordChange();
      try {
        const me = await api("/me");
        if (me && me.user) session = me.user;
      } catch (_) {}
      unlockUI(session);
      if (onLogin) onLogin(session);
    } catch (e) {
      if (err) {
        err.textContent = e.message || "登录失败，请稍后重试";
        err.classList.remove("hidden");
      }
    } finally {
      loggingIn = false;
      if (btn) btn.disabled = false;
    }
  }
  async function promptPasswordChange() {
    if (changePromise) return changePromise;
    changePromise = new Promise((resolve) => {
      const passwordGate = document.createElement("div");
      passwordGate.className = "auth-gate";
      passwordGate.setAttribute("role", "dialog");
      passwordGate.setAttribute("aria-modal", "true");
      passwordGate.setAttribute("aria-labelledby", "passwordTitle");
      passwordGate.innerHTML =
        '<div class="auth-card"><h2 id="passwordTitle">请先修改初始密码</h2><p class="auth-hint">至少12位，包含字母和数字；不能与当前密码相同。不要把密码发在聊天中。</p><div id="passwordErr" class="auth-err hidden" role="alert"></div><form id="passwordForm"><label for="oldPassword">当前密码</label><input id="oldPassword" name="current-password" type="password" maxlength="128" autocomplete="current-password" required><label for="newPassword">新密码</label><input id="newPassword" name="new-password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required><label for="confirmPassword">再输入新密码</label><input id="confirmPassword" name="new-password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required><button class="auth-submit" type="submit">保存新密码</button></form></div>';
      document.body.appendChild(passwordGate);
      const form = passwordGate.querySelector("form");
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const submitBtn = form.querySelector("button");
        const err = passwordGate.querySelector("#passwordErr");
        err.classList.add("hidden");
        const current = document.getElementById("oldPassword").value;
        const next = document.getElementById("newPassword").value;
        if (next !== document.getElementById("confirmPassword").value) {
          err.textContent = "两次输入的新密码不一致";
          err.classList.remove("hidden");
          return;
        }
        if (next === current) {
          err.textContent = "新密码不能和当前密码相同";
          err.classList.remove("hidden");
          return;
        }
        if (next.length < 12 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) {
          err.textContent = "新密码至少12位，需含字母和数字";
          err.classList.remove("hidden");
          return;
        }
        submitBtn.disabled = true;
        try {
          const d = await api("/change-password", {
            method: "POST",
            body: { current_password: current, new_password: next },
            skipPasswordGate: true,
          });
          captureCsrf(null, d);
          if (d.user) session = Object.assign({}, session || {}, d.user, { must_change_password: false });
          passwordGate.remove();
          resolve(d);
        } catch (e) {
          err.textContent = e.message || "修改失败，请重试";
          err.classList.remove("hidden");
          submitBtn.disabled = false;
        }
      });
      const oldEl = passwordGate.querySelector("#oldPassword");
      if (oldEl) oldEl.focus();
    });
    return changePromise.finally(() => {
      changePromise = null;
    });
  }
  function require(callback) {
    injectStyles();
    onLogin = callback;
    const form = document.getElementById("authForm");
    if (form && !form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", login);
    }
    const btnLogout = document.getElementById("btnLogout");
    if (btnLogout && !btnLogout.dataset.bound) {
      btnLogout.dataset.bound = "1";
      btnLogout.addEventListener("click", logout);
    }
    api("/me")
      .then(async (d) => {
        const user = d && d.user;
        if (!user) throw new Error("当前没有登录会话");
        captureCsrf(null, d);
        session = user;
        if (user.must_change_password) await promptPasswordChange();
        unlockUI(session);
        if (onLogin) onLogin(session);
      })
      .catch(() => lockUI());
  }
  async function logout() {
    try {
      await api("/logout", { method: "POST", body: {} });
    } catch (e) {}
    session = null;
    csrf = "";
    onLogin = null;
    try { sessionStorage.removeItem("mingdan_auth_v1"); } catch (e) {}
    location.reload();
  }
  function adminNotice(text) {
    const n = document.getElementById("adminNotice");
    if (n) n.textContent = text || "";
  }
  function roleLabel(role) {
    return role === "admin" ? "管理员" : "普通用户";
  }
  function createdLabel(u) {
    const v = u.createdAt || u.created_at || u.created || "";
    if (!v) return "—";
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 16).replace("T", " ");
    return s;
  }
  function canDeleteUser(u) {
    const name = u && (u.username || u.name);
    if (!name || name === BOOTSTRAP_ADMIN) return false;
    if (session && name === session.username) return false;
    return true;
  }
  async function loadUsers() {
    const d = await api("/admin/users");
    const host = document.getElementById("adminUsers");
    if (!host) return;
    host.replaceChildren();
    const table = document.createElement("table");
    table.className = "admin-user-table";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["用户名", "角色", "创建时间", "操作"].forEach((label) => {
      const th = document.createElement("th");
      th.textContent = label;
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    table.appendChild(head);
    const body = document.createElement("tbody");
    const users = d.users || [];
    if (!users.length) {
      const row = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.textContent = "暂无账号";
      row.appendChild(td);
      body.appendChild(row);
    }
    users.forEach((u) => {
      const name = u.username || u.name || "";
      const row = document.createElement("tr");
      const nameTd = document.createElement("td");
      nameTd.textContent = name;
      const roleTd = document.createElement("td");
      roleTd.textContent = roleLabel(u.role);
      roleTd.className = u.role === "admin" ? "role-admin" : "role-user";
      const timeTd = document.createElement("td");
      timeTd.textContent = createdLabel(u);
      const actions = document.createElement("td");
      if (canDeleteUser(u)) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "admin-del";
        del.textContent = "删除";
        del.onclick = async () => {
          if (!confirm("确认删除人员「" + name + "」？")) return;
          del.disabled = true;
          try {
            await api("/admin/users/" + encodeURIComponent(name), { method: "DELETE" });
            adminNotice("已删除");
            await loadUsers();
          } catch (e) {
            adminNotice(e.message);
            del.disabled = false;
          }
        };
        actions.appendChild(del);
      } else {
        actions.textContent = "—";
      }
      row.append(nameTd, roleTd, timeTd, actions);
      body.appendChild(row);
    });
    table.appendChild(body);
    host.appendChild(table);
  }
  function bindAdmin() {
    const form = document.getElementById("adminAddUser");
    if (!form || form.dataset.bound) {
      loadUsers().catch((e) => adminNotice(e.message));
      return;
    }
    form.dataset.bound = "1";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type='submit']");
      const nameEl = document.getElementById("adminNewName");
      const passEl = document.getElementById("adminNewPassword");
      const roleEl = document.getElementById("adminNewRole");
      const username = nameEl ? nameEl.value.trim() : "";
      const password = passEl ? passEl.value.trim() : "";
      const role = roleEl && roleEl.value === "admin" ? "admin" : "staff";
      if (!username || !password) {
        adminNotice("请填写用户名和密码");
        return;
      }
      if (btn) btn.disabled = true;
      try {
        await api("/admin/users", {
          method: "POST",
          body: { username, password, role },
        });
        form.reset();
        if (roleEl) roleEl.value = "staff";
        adminNotice("已添加人员");
        await loadUsers();
      } catch (err) {
        adminNotice(err.message);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    loadUsers().catch((e) => adminNotice(e.message));
  }
  injectStyles();
  const client = {
    require,
    logout,
    currentUser: () => (session && session.username ? session.username : ""),
    isAdmin: () => !!(session && session.role === "admin"),
    api,
    authHeaders,
    promptPasswordChange,
  };
  try { if (typeof window !== "undefined") window.MingdanAuth = client; } catch (e) {}
  return client;
})();
