CS2 PRO — CATÁLOGO DE CURSOS E AULAS

Arquivos:
- training_catalog.json: catálogo estruturado, com cursos localizados e aulas agrupadas por família de curso.
- courses_normalized.csv: cursos por idioma.
- lessons_normalized.csv: aulas com URL, título original, slug do curso e indicação conservadora de idioma.

Fontes: dois CSVs fornecidos pelo proprietário do projeto.

Limpeza:
- Excluídas todas as 116 linhas cuja URL contém "sample-course".
- Mantidas 2.795 aulas, com 2.795 URLs únicas.
- Mantidos 121 cursos localizados.
- Não foram removidas aulas por título repetido, pois títulos iguais podem representar aulas em idiomas/curso diferentes. URLs são únicas.

Idiomas do projeto: BR=pt-BR, EN=en, ES=es, FR=fr, PT=pt-PT.

IMPORTANTE SOBRE IDIOMA DAS AULAS:
O idioma é marcado como explícito somente quando o slug do curso na URL da aula termina com -br, -en, -es, -fr ou -pt. Quando não há sufixo, language_hint fica vazio/null. O sistema deve validar o idioma pelo título e pelo curso localizado correspondente; não deve presumir que uma aula sem idioma explícito está disponível em todos os idiomas.

Trilhas:
- Os cinco cursos Counter-Strike 2 PRO | In-Game 1–5 recebem track_hint=counter_strike_in_game.
- Os demais cursos recebem track_hint=cross_trail. A classificação entre Conhecimentos Estratégicos e Habilidades Extras deve ser confirmada pelo conteúdo/metadados do curso; não inferir só pelo nome.

Recomendação técnica:
Tratar este catálogo como fonte de dados editável, não como URLs hardcoded no prompt do modelo. Criar armazenamento/CRUD administrativo ou arquivo versionado único com importação/validação. Cada item deve ter ID estável, idioma, trilha, título, URL, curso e status active/inactive. O Coach deve consultar o catálogo via função/API com filtro por idioma, trilha e relevância; devolver links apenas de itens ativos e URLs validadas. Permitir adicionar, editar, desativar/excluir e importar novos CSV/JSON sem alterar prompts ou código do Coach.
