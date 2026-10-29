export const authTestPage = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/png" sizes="26x26" href="/favicon.png">
  <title>Вход · Text-to-BPMN Studio</title>
  <style>
    :root { font: 16px/1.5 Inter, system-ui, sans-serif; color: #263536; background: #f3f6f3; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
    main { width: min(440px, 100%); padding: 32px; border: 1px solid #dce4df; border-radius: 18px; background: #fff; box-shadow: 0 12px 32px #26353612; text-align: center; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 0 0 24px; color: #64716e; }
    .button { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 20px; border-radius: 10px; background: #27766b; color: #fff; font: inherit; font-weight: 600; text-decoration: none; }
    .error { margin: 0 0 18px; padding: 12px; border-radius: 10px; background: #fff3ef; color: #934d42; }
    .back { display: block; margin-top: 18px; color: #52635f; }
    [hidden] { display: none !important; }
    @media (max-width: 500px) { main { padding: 24px 18px; } h1 { font-size: 21px; } }
  </style>
</head>
<body>
  <main>
    <h1>Вход в Text-to-BPMN Studio</h1>
    <p>Войдите через Google, чтобы перейти в студию моделирования процессов.</p>
    <div id="error" class="error" role="alert" hidden>Не удалось выполнить вход через Google. Попробуйте ещё раз.</div>
    <a class="button" href="/api/auth/google?next=%2F">Войти через Google</a>
    <a class="back" href="/">Вернуться в студию</a>
  </main>
  <script>
    if (new URLSearchParams(location.search).get("login") === "failed") {
      document.querySelector("#error").hidden = false;
    }
  </script>
</body>
</html>`;
