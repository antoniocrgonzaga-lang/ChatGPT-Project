# Conceito artístico — Stage 4: ABYSSAL ARMADA

## Narrativa
A nova de Nyx ilumina o que a frota escondia: muito além da borda da galáxia, no espaço profundo, a **Leviatã**, uma nave-mãe do tamanho de uma cidade, reúne uma nova armada. A VX segue os rastros de dobra para fora da galáxia, atravessa a formação de cruzadores, mergulha no casco da nave-mãe, invade o hangar e chega ao coração dela: a **Abyssal Matriarch**, a mente que comanda a frota inteira. Quando a Matriarca cai, a Leviatã se parte numa reação em cadeia. É o fim da campanha.

## Paleta
| Papel | Cores | Motivo |
| --- | --- | --- |
| Espaço | quase preto `#010205`, azul-ardósia `#0A1420` | O vazio entre galáxias: a fase mais escura do jogo, para o contraste valer |
| Galáxia | núcleo marfim `#FFE8C8`, braços azul-gelo `#8AB8FF`, regiões H II rosadas `#FF7AB0` | O espetáculo do céu: uma galáxia espiral inteira vista de fora |
| Nave-mãe | casco grafite `#1A1E24`, milhares de luzes brancas e âmbar, motores branco-azulados | Escala: as luzes revelam o tamanho |
| Tecnologia inimiga | verde-esmeralda `#35FF8A` (frisos, tiros `#7DFF4A`, hangar, núcleo) | Cor nova na campanha, depois do violeta, do carmesim e do ouro |
| Jogador | ciano (ou o vermelho da Carrasco) | Continuidade |

## Linguagem de formas
- **Lâminas longas e escalonadas**: cascos em forma de punhal, conveses em camadas, torres de comando, antenas.
- **Escala monumental**: objetos de centenas a milhares de unidades, sempre com fileiras de luzes pequenas para dar a medida.
- **Geometria de hangar**: costelas em arco, trilhos de lançamento, guindastes, naves atracadas em fileiras.

## Estrutura da fase
1. **O Vazio**: a nave sai da galáxia. Escuridão quase total, a galáxia espiral enorme no céu e uma trilha de boias de navegação piscando. Ao fundo, a silhueta da Leviatã cresce a cada segundo.
2. **A Armada**: voo entre cruzadores de 300 a 500 unidades, que avançam em paralelo. Eles disparam **salvas laterais**: feixes que cruzam a rota a partir dos canhões dos próprios cruzadores, sempre deixando uma faixa livre.
3. **A Sombra da Leviatã**: a nave-mãe ocupa o céu e tampa a galáxia. Campo de destroços, minas e porta-naves lançando drones.
4. **Casco da Leviatã**: voo rasante numa **trincheira** do casco, com paredes cheias de torres, vigas cruzando o caminho, antenas e domos. Termina na comporta do hangar, que se abre.
5. **Hangar**: um salão colossal com costelas em arco, caças atracados em fileiras, trilhos de lançamento com setas verdes e guindastes atravessando a rota. Os inimigos decolam das docas.
6. **Conduto do núcleo**: túnel circular em alta velocidade, com anéis de energia girando e **grades de contenção**.
7. **Coração da Leviatã**: câmara esférica onde a Matriarca está suspensa.

## Mecânica nova: grade de contenção
Feixes horizontais e verticais acendem juntos e deixam **uma única célula livre**, marcada em verde no aviso. É preciso chegar até ela antes do disparo. Aparece no conduto e no chefe.

## Chefe: ABYSSAL MATRIARCH
Um núcleo esférico com uma íris verde, envolto em quatro pétalas blindadas e um anel de contenção com quatro pilones.
- **Fase 1**: os quatro **pilones** projetam um escudo hexagonal sobre o núcleo e disparam rajadas. Hangares laterais lançam drones.
- **Fase 2**: sem escudo, as pétalas se abrem pela metade e expõem quatro **nós**. Ela alterna **grades de contenção**, leques de tiros e rajadas giratórias.
- **Fase 3**: as pétalas se abrem por completo e o **núcleo** fica exposto. Vêm espirais, grades mais rápidas e reforços de caças.
- **Derrota**: o núcleo implode, seguido da cutscene final: a Leviatã se parte em explosões em cadeia diante da galáxia.

## Onde está no código
- Fase: `src/stages/Stage4.js` (céu `ABYSS_SKY`, seções, eventos, cruzadores e salvas)
- Nave-mãe e cruzadores (modelos procedurais): `src/scenery/Mothership.js`
- Galáxia do céu: `galaxy` no preset do céu, desenhada em `src/scenery/NebulaSkybox.js`
- Chefe: `src/entities/bosses/AbyssalMatriarch.js` (parâmetros em `BOSSES.abyssalMatriarch`)
- Cutscene final: variante `'mothership'` em `src/systems/Sequences.js`
