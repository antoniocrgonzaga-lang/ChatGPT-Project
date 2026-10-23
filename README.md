# ChatGPT Project

Coleção de jogos para jogar diretamente no navegador, com código e documentação organizados por projeto.

## Jogar online

**[▶ Jogar Neon Star Assault](https://antoniocrgonzaga-lang.github.io/ChatGPT-Project/games/neon-star-assault/)**

[Abrir a coleção de jogos](https://antoniocrgonzaga-lang.github.io/ChatGPT-Project/)

| Jogo | Descrição | Código e manual |
| --- | --- | --- |
| Neon Star Assault | Shooter espacial 3D, 4 estágios, 4 chefes e 3 naves | [Abrir projeto](games/neon-star-assault/) |

## Organização

```text
index.html                 página inicial com acesso aos jogos
games/neon-star-assault/    jogo completo, fontes, modelos e bibliotecas locais
docs/                      publicação e manutenção do repositório
.nojekyll                  mantém a publicação estática sem processamento Jekyll
```

Cada jogo mantém seu próprio README, configurações e arquivos. Novos jogos podem ser adicionados como pastas em `games/`, com um cartão na página inicial.

## Executar no computador

Na pasta `games/neon-star-assault/`, abra `start.bat` no Windows. Consulte o [manual do jogo](games/neon-star-assault/README.md) para alternativas, requisitos e controles completos.

Também é possível servir a raiz deste repositório com qualquer servidor HTTP estático e abrir o `index.html`. Não abra diretamente por `file://`: módulos JavaScript e modelos GLB precisam de HTTP.

## Publicação

Hospedado no GitHub Pages, a partir da branch `main`, pasta `/ (root)`. Não exige build para jogar: as bibliotecas Three.js usadas pelo jogo já estão em `vendor/` e são resolvidas pelo import map local.

Veja [docs/PUBLICACAO.md](docs/PUBLICACAO.md) para atualizar ou validar a publicação.

## Origem e licenças

O jogo foi importado do arquivo `Soul.rar` fornecido pelo proprietário do repositório. As mecânicas, fases e modelos originais foram preservados. `node_modules/`, caches e configurações locais do assistente foram excluídos da publicação.

A licença do Three.js está em [games/neon-star-assault/vendor/three/LICENSE](games/neon-star-assault/vendor/three/LICENSE). Não foi atribuída uma nova licença ao código ou aos modelos do jogo.
