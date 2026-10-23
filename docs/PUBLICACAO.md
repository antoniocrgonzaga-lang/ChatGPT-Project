# Publicação e manutenção

## URLs

- Coleção: https://antoniocrgonzaga-lang.github.io/ChatGPT-Project/
- Jogo: https://antoniocrgonzaga-lang.github.io/ChatGPT-Project/games/neon-star-assault/

## GitHub Pages

Em **Settings → Pages → Build and deployment**, use **Deploy from a branch**, branch **main**, pasta **/ (root)**. O arquivo `.nojekyll` permite servir o conteúdo estático diretamente. A publicação automática aparece na aba **Actions** como `pages build and deployment`.

Ao atualizar os fontes, faça commit na `main` e aguarde a conclusão da publicação. Os caminhos dos módulos, biblioteca e modelos são relativos à pasta do jogo, permitindo a execução no subdiretório do GitHub Pages.

## Conteúdo do jogo

`games/neon-star-assault/` contém os fontes originais e os modelos GLB. Não envie `node_modules`, arquivos `.env`, caches, backups nem o arquivo RAR para o repositório.

Para usar o fluxo opcional Vite, execute `npm ci` e `npm run build` dentro da pasta do jogo. O `dist/` gerado é local e ignorado pelo Git. O site publicado usa diretamente os fontes versionados e `vendor/`.

## Verificação depois de publicar

1. Abra a coleção e clique em **Jogar online**.
2. Aguarde o carregamento e confira a seleção das três naves.
3. Inicie uma partida, teste disparo e pausa.
4. Confira se não há erros de módulos ou arquivos ausentes no console/rede do navegador.

O jogo usa teclado ou gamepad e requer WebGL. As configurações são armazenadas localmente no navegador.
