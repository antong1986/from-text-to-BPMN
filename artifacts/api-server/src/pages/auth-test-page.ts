export const authTestPage = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/png" sizes="26x26" href="/favicon.png">
  <title>Проверка авторизации · Text-to-BPMN</title>
  <style>
    :root { font: 16px/1.5 Inter, system-ui, sans-serif; color: #263536; background: #f3f6f3; }
    [hidden] { display: none !important; }
    body { margin: 0; padding: 32px 16px; }
    main { width: min(720px, 100%); margin: 0 auto; padding: 24px; border: 1px solid #dce4df; border-radius: 16px; background: #fff; box-shadow: 0 12px 32px #26353612; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    p { color: #64716e; }
    .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .status { margin: 18px 0; padding: 14px; border-radius: 10px; background: #eff4f1; }
    button, .button { display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 9px; padding: 10px 14px; background: #27766b; color: white; font: inherit; text-decoration: none; cursor: pointer; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    .secondary { background: #e8eeea; color: #41524e; }
    textarea { box-sizing: border-box; width: 100%; min-height: 120px; margin: 12px 0; padding: 12px; border: 1px solid #d5ded9; border-radius: 10px; font: inherit; }
    pre { max-height: 360px; overflow: auto; padding: 14px; border-radius: 10px; background: #202c2d; color: #dfeae5; white-space: pre-wrap; overflow-wrap: anywhere; }
    .muted { font-size: 13px; }
    a:not(.button) { color: #27766b; }
    @media (max-width: 500px) { body { padding: 14px 10px; } main { padding: 17px; } h1 { font-size: 19px; } }
  </style>
</head>
<body>
  <main>
    <h1>Проверка авторизации и лимитов</h1>
    <p class="muted">Войдите через Google, проверьте оставшиеся генерации и протестируйте защищённый BPMN API.</p>
    <div id="status" class="status" role="status">Загружаю статус…</div>
    <div class="row">
      <a id="login" class="button" href="/api/auth/google?next=%2Fapi%2Fauth%2Ftest">Войти через Google</a>
      <button id="logout" class="secondary" type="button" hidden>Выйти</button>
      <a class="button secondary" href="/">Открыть Text-to-BPMN Studio</a>
    </div>
    <label for="prompt"><strong>Тестовое описание процесса</strong></label>
    <textarea id="prompt">Клиент отправляет заявку. Система проверяет данные, сохраняет заявку и сообщает результат.</textarea>
    <div class="row">
      <button id="generate" type="button" disabled>Сгенерировать BPMN XML</button>
    </div>
    <pre id="result" hidden></pre>
  </main>
  <script>
    const statusBox = document.querySelector("#status");
    const login = document.querySelector("#login");
    const logout = document.querySelector("#logout");
    const generate = document.querySelector("#generate");
    const resultBox = document.querySelector("#result");
    let authenticated = false;

    async function refreshStatus() {
      try {
        const response = await fetch("/api/auth/me", { credentials: "same-origin" });
        const data = await response.json();
        authenticated = Boolean(data.authenticated && data.user);
        login.hidden = authenticated;
        logout.hidden = !authenticated;
        generate.disabled = !authenticated;
        if (!authenticated) {
          statusBox.textContent = "Вы не вошли. Нажмите «Войти через Google», чтобы проверить доступ и лимиты.";
          return;
        }
        const user = data.user;
        const tier = user.isWhitelisted ? "безлимитный доступ (whitelist)" :
          user.hasActivePremium ? "активная подписка" : "бесплатный план";
        const left = user.isWhitelisted || user.hasActivePremium
          ? "Лимит генераций не расходуется."
          : "Осталось бесплатных генераций: " + user.freeGenerationsLeft + ".";
        statusBox.textContent = user.email + " · " + tier + ". " + left;
      } catch {
        statusBox.textContent = "Не удалось получить статус. Проверьте, что API и PostgreSQL запущены.";
      }
    }

    logout.addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      await refreshStatus();
      resultBox.hidden = true;
    });

    generate.addEventListener("click", async () => {
      const textPrompt = document.querySelector("#prompt").value.trim();
      if (!textPrompt) return;
      generate.disabled = true;
      resultBox.hidden = false;
      resultBox.textContent = "Запрос отправлен…";
      try {
        const response = await fetch("/api/bpmn/generate", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "Accept": "application/xml, application/json" },
          body: JSON.stringify({ textPrompt })
        });
        const body = await response.text();
        if (!response.ok) {
          try { resultBox.textContent = JSON.stringify(JSON.parse(body), null, 2); }
          catch { resultBox.textContent = body || "Ошибка HTTP " + response.status; }
          return;
        }
        resultBox.textContent = body;
        await refreshStatus();
      } catch (error) {
        resultBox.textContent = error instanceof Error ? error.message : "Сетевая ошибка.";
      } finally {
        generate.disabled = !authenticated;
      }
    });

    refreshStatus();
  </script>
</body>
</html>`;
