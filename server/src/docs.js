/** /api/docs —— 用 CDN 的 Swagger UI 渲染 openapi.yaml */
export const docsHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>场馆预约 API 文档</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>body{margin:0}.topbar{display:none}</style>
</head>
<body>
  <div id="swagger"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({ url: '/openapi.yaml', dom_id: '#swagger', deepLinking: true });
  </script>
</body>
</html>`;
