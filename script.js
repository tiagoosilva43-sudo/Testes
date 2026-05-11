"use strict";

// ================= VARIÁVEIS GERAIS DE ESTADO =================
let bancoDePartes = [];
let mapaAtual = [];
let mapGroupsGlobais = [];
let handleArquivoAtual = null; // Reteem a permissão de sobrescrita nativa do arquivo .json

const regexAcordeGlobal = /\b([A-G][b#]?(2|4|5|6|7|9|11|13|maj|min|m|sus|dim|aug)*(\/[A-G][b#]?)?)\b/g;

// MAPEAMENTO DO DOM
const dom = {
    inputTitulo: document.getElementById('inputTitulo'),
    inputAutor: document.getElementById('inputAutor'),
    inputTom: document.getElementById('inputTom'),
    inputBpm: document.getElementById('inputBpm'),
    inputCompasso: document.getElementById('inputCompasso'),
    idParte: document.getElementById('idParte'),
    tituloParte: document.getElementById('tituloParte'),
    conteudoParte: document.getElementById('conteudoParte'),
    corParte: document.getElementById('corParte'),
    editIndex: document.getElementById('editIndex'),
    btnSalvar: document.getElementById('btnSalvar'),
    listaPartes: document.getElementById('listaPartes'),
    paleta: document.getElementById('paleta'),
    linhaTempo: document.getElementById('linha-tempo'),
    previewMapa: document.getElementById('preview-mapa'),
    modal: document.getElementById('modalConversor'),
    textoConversor: document.getElementById('textoCifraCru'),
    sidebar: document.getElementById('sidebar'),
    docContainer: document.getElementById('documento-container')
};

// ================= INICIALIZAÇÃO DO DRAG AND DROP (SORTABLE.JS) =================
document.addEventListener("DOMContentLoaded", function() {
// 1. Define a função que aplica o tema
    const aplicarTema = (deveSerEscuro) => {
        if (deveSerEscuro) {
            document.body.classList.add('dark');
        } else {
            document.body.classList.remove('dark');
        }
    };

    // 2. PRIORIDADE: Verifica o que o sistema/navegador está usando AGORA
    const prefereEscuroPeloSistema = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Aplica o tema do sistema imediatamente ao abrir
    aplicarTema(prefereEscuroPeloSistema);

    // 3. Ouvinte para mudar o tema em tempo real caso você mude a configuração do Windows com o app aberto
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        aplicarTema(e.matches);
    });

    // 4. Linha do Tempo (Comentários e Dinâmicas)
    new Sortable(dom.linhaTempo, {
        handle: '.drag-handle', 
        animation: 200,         
        ghostClass: 'sortable-ghost',
        onEnd: function (evt) {
            const itemMovido = mapaAtual.splice(evt.oldIndex, 1)[0];
            mapaAtual.splice(evt.newIndex, 0, itemMovido);
            renderizarTimeline();
        }
    });

    // 5. Mapa Final (Preview superior)
    new Sortable(dom.previewMapa, {
        filter: '.nao-arrastavel, .btn-excluir-preview',
        animation: 200,
        ghostClass: 'sortable-ghost',
        onEnd: function (evt) {
            const nodes = Array.from(dom.previewMapa.children);
            let novoMapa = [];
            nodes.forEach(node => {
                const gIdx = node.getAttribute('data-group-index');
                if (gIdx !== null) {
                    novoMapa.push(...mapGroupsGlobais[gIdx]); 
                }
            });
            mapaAtual = novoMapa;
            renderizarTimeline(); 
        }
    });

    // 6. Banco de Partes Salvas (Permite reordenar as seções criadas no Passo 2)
    new Sortable(dom.listaPartes, {
        handle: '.drag-handle-banco',
        animation: 200,
        ghostClass: 'sortable-ghost',
        onEnd: function (evt) {
            const itemMovido = bancoDePartes.splice(evt.oldIndex, 1)[0];
            bancoDePartes.splice(evt.newIndex, 0, itemMovido);
            atualizarUI();
        }
    });
});

// ================= NAVEGAÇÃO E CONTROLES GERAIS =================
function toggleMenu() { 
    dom.sidebar.classList.toggle('fechado'); 
}

function mudarPasso(n) {
    // Salva automaticamente o rascunho da seção se estiver preenchida ao sair do Passo 2
    if (document.getElementById('passo2').classList.contains('ativo') && n !== 2) {
        if (dom.editIndex.value !== "-1") {
            const id = dom.idParte.value.trim();
            const t = dom.tituloParte.value.trim();
            const c = dom.conteudoParte.value.trim();
            const index = parseInt(dom.editIndex.value, 10);
            
            if (id && t && c) {
                const cor = dom.corParte.value;
                const oldId = bancoDePartes[index].id;
                bancoDePartes[index] = { id, t, c, cor };
                mapaAtual.forEach(inst => { 
                    if(inst.id === oldId) { inst.id = id; inst.t = t; inst.c = c; inst.cor = cor; } 
                });
            }
            
            dom.idParte.value = ''; dom.tituloParte.value = ''; dom.conteudoParte.value = '';
            dom.editIndex.value = "-1";
            dom.btnSalvar.innerText = "+ Salvar Seção";
            dom.btnSalvar.style.background = "var(--cor-sucesso)";
            atualizarUI();
        }
    }

    document.querySelectorAll('.passo').forEach(p => p.classList.remove('ativo'));
    document.getElementById('passo' + n).classList.add('ativo');
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('ativo'));
    document.getElementById('link-passo' + n).classList.add('ativo');

    dom.sidebar.classList.add('fechado');

    if(n === 2) atualizarUI();
    if(n === 3) renderizarTimeline(); 
    if(n === 4) {
        const displayTom = document.getElementById('displayTomAtual');
        if (displayTom) displayTom.innerText = "Tom: " + (dom.inputTom.value || "?");
        gerarDocumento();
    }
}

function iniciarNovaMusica() { 
    if(confirm("Reiniciar todo o projeto? O progresso não salvo será perdido.")) {
        handleArquivoAtual = null;
        location.reload(); 
    }
}

// ================= SELETOR DE CORES CUSTOMIZADO =================
const coresDoApp = [
    '#8a0000', '#995c00', '#0a5700', '#007070',
    '#001773', '#66005e', '#968a00', '#4e5e63' 
];

const painelCores = document.getElementById('painelCores');
const btnSeletorCores = document.getElementById('btnSeletorCores');
const inputOcultoCor = document.getElementById('corParte');

function inicializarGradeCores() {
    const grade = document.getElementById('gradeCoresPalette');
    if (!grade) return;
    grade.innerHTML = ''; 

    coresDoApp.forEach((corHex, index) => {
        const miniBolinha = document.createElement('button');
        miniBolinha.type = 'button';
        miniBolinha.className = 'palette-color-btn';
        miniBolinha.style.backgroundColor = corHex;
        miniBolinha.title = `Cor ${index + 1}`;
        
        if (corHex === inputOcultoCor.value) miniBolinha.classList.add('selecionada');

        miniBolinha.onclick = (e) => {
            e.stopPropagation(); 
            mudarCorEfetiva(corHex);
            fecharPainelCores();
        };

        grade.appendChild(miniBolinha);
    });
}

function togglePainelCores() { 
    if (painelCores) painelCores.classList.toggle('aberto'); 
}

function fecharPainelCores() { 
    if (painelCores) painelCores.classList.remove('aberto'); 
}

function mudarCorEfetiva(novaCorHex) {
    if (btnSeletorCores) btnSeletorCores.style.backgroundColor = novaCorHex;
    if (inputOcultoCor) inputOcultoCor.value = novaCorHex;

    document.querySelectorAll('.palette-color-btn').forEach(btn => {
        if (btn.style.backgroundColor === novaCorHex) {
            btn.classList.add('selecionada');
        } else {
            btn.classList.remove('selecionada');
        }
    });
}

document.addEventListener('click', function(event) {
    const container = document.querySelector('.color-picker-container');
    if (container && !container.contains(event.target)) {
        fecharPainelCores();
    }
});

inicializarGradeCores();

// ================= CARREGAMENTO E SALVAMENTO NATIVO (FILE SYSTEM API) =================
async function carregarProjeto() {
    if (window.showOpenFilePicker) {
        try {
            const [handle] = await window.showOpenFilePicker({
                startIn: 'downloads', // Força abertura nativa direto na pasta Downloads
                types: [{
                    description: 'Arquivo de Projeto JSON',
                    accept: { 'application/json': ['.json'] }
                }],
                multiple: false
            });
            
            handleArquivoAtual = handle;
            const file = await handle.getFile();
            const texto = await file.text();
            processarConteudoJson(texto);
        } catch (err) { return; }
    } else {
        const fallback = document.getElementById('arquivoProjetoFallback');
        if (fallback) fallback.click();
    }
}

function carregarProjetoLegado(event) {
    if (!event.target.files[0]) return;
    const reader = new FileReader();
    reader.onload = function() {
        handleArquivoAtual = null; 
        processarConteudoJson(reader.result);
    };
    reader.readAsText(event.target.files[0]);
}

function processarConteudoJson(jsonString) {
    try {
        const p = JSON.parse(jsonString);
        dom.inputTitulo.value = p.titulo || "";
        dom.inputAutor.value = p.autor || "";
        dom.inputTom.value = p.tom || "";
        dom.inputBpm.value = p.bpm || "";
        dom.inputCompasso.value = p.compasso || "";
        bancoDePartes = p.bancoDePartes || [];
        mapaAtual = p.mapaAtual || [];
        
        atualizarUI();
        renderizarTimeline();
        mudarPasso(4);
    } catch (e) { 
        mostrarToast("Erro ao carregar o arquivo. O JSON é inválido."); 
    }
}

async function salvarProjeto() {
    const projeto = {
        titulo: dom.inputTitulo.value,
        autor: dom.inputAutor.value,
        tom: dom.inputTom.value,
        bpm: dom.inputBpm.value,
        compasso: dom.inputCompasso.value,
        bancoDePartes: bancoDePartes,
        mapaAtual: mapaAtual
    };
    const jsonString = JSON.stringify(projeto, null, 2);

    // 1. Sobrescreve direto se já existe vínculo aberto
    if (handleArquivoAtual && window.showOpenFilePicker) {
        try {
            const writable = await handleArquivoAtual.createWritable();
            await writable.write(jsonString);
            await writable.close();
            mostrarToast("Projeto salvo com sucesso!");
            return;
        } catch (err) { 
            console.error("Falha ao sobrescrever, abrindo salvar como nativo...", err); 
        }
    }
    
    // 2. Salvar como nativo direcionando para Downloads
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                startIn: 'downloads', // Força sugestão nativa na pasta Downloads
                suggestedName: (projeto.titulo || "cifras") + ".json",
                types: [{
                    description: 'Arquivo de Projeto JSON',
                    accept: { 'application/json': ['.json'] }
                }]
            });
            const writable = await handle.createWritable();
            await writable.write(jsonString);
            await writable.close();
            
            handleArquivoAtual = handle; 
            mostrarToast("Projeto salvo com sucesso!");
            return;
        } catch (err) { return; }
    }

    // 3. Fallback de download via Blob para navegadores sem suporte
    const blob = new Blob([jsonString], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; 
    a.download = (projeto.titulo || "cifras") + ".json";
    a.click();
    URL.revokeObjectURL(url);
}

// ================= LÓGICA DE TRANSPOSIÇÃO DE TOM =================
const ESCALA_SUSTENIDOS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ESCALA_BEMOIS     = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function transporNota(nota, semitons) {
    let index = ESCALA_SUSTENIDOS.indexOf(nota);
    let usaBemol = false;

    if (index === -1) {
        index = ESCALA_BEMOIS.indexOf(nota);
        usaBemol = true;
    }

    if (index === -1) return nota; 

    let novoIndex = (index + semitons) % 12;
    if (novoIndex < 0) novoIndex += 12;

    return usaBemol ? ESCALA_BEMOIS[novoIndex] : ESCALA_SUSTENIDOS[novoIndex];
}

function transporAcorde(acordeCompleto, semitons) {
    // Separa de forma inteligente: Tónica, Tensões e Baixo Invertido
    const regexSeparador = /^([A-G][b#]?)(.*?)(\/([A-G][b#]?))?$/;
    const match = acordeCompleto.match(regexSeparador);

    if (!match) return acordeCompleto;

    const notaFundamental = match[1];
    const extensao        = match[2] || "";
    const temBaixo        = match[3] ? true : false;
    const notaBaixo       = match[4] || "";

    let novoAcorde = transporNota(notaFundamental, semitons) + extensao;

    if (temBaixo && notaBaixo) {
        novoAcorde += "/" + transporNota(notaBaixo, semitons);
    }

    return novoAcorde;
}

function transporMusica(semitons) {
    let tomAtual = dom.inputTom.value.trim();
    if (tomAtual) {
        let matchTom = tomAtual.match(/^([A-G][b#]?)(.*)$/);
        if (matchTom) {
            dom.inputTom.value = transporNota(matchTom[1], semitons) + matchTom[2];
        }
    }

    const displayTom = document.getElementById('displayTomAtual');
    if (displayTom) displayTom.innerText = "Tom: " + (dom.inputTom.value || "?");

    const regexBuscaColchetes = /\[(.*?)\]/g;

    bancoDePartes.forEach(parte => {
        parte.c = parte.c.replace(regexBuscaColchetes, (matchTotal, conteudoAcorde) => {
            return "[" + transporAcorde(conteudoAcorde.trim(), semitons) + "]";
        });
    });

    mapaAtual.forEach(inst => {
        inst.c = inst.c.replace(regexBuscaColchetes, (matchTotal, conteudoAcorde) => {
            return "[" + transporAcorde(conteudoAcorde.trim(), semitons) + "]";
        });
    });

    gerarDocumento();
}

// ================= CONVERSOR DE CIFRAS E GESTÃO DE PARTES =================
function abrirConversor() { 
    if (dom.modal) dom.modal.style.display = 'flex'; 
}

function fecharConversor() { 
    if (dom.modal) dom.modal.style.display = 'none'; 
    if (dom.textoConversor) dom.textoConversor.value = ""; 
}

function processarConversao() {
    const textoCru = dom.textoConversor.value;
    if (!textoCru.trim()) return fecharConversor(); 

    const linhas = textoCru.split('\n');
    let resultado = "";
    
    for (let i = 0; i < linhas.length; i++) {
        let lAtual = linhas[i]; 
        let lProx = linhas[i + 1] || "";
        const matches = lAtual.match(regexAcordeGlobal);
        
        if (matches && lAtual.replace(regexAcordeGlobal, '').trim().length < lAtual.length / 2) {
            let linhaFundida = ""; let cursor = 0; let acordes = []; let m;
            regexAcordeGlobal.lastIndex = 0;
            while ((m = regexAcordeGlobal.exec(lAtual)) !== null) {
                acordes.push({ nota: m[0], pos: m.index });
            }
            
            acordes.forEach(acc => { 
                linhaFundida += lProx.substring(cursor, acc.pos) + "[" + acc.nota + "]"; 
                cursor = acc.pos; 
            });
            linhaFundida += lProx.substring(cursor);
            resultado += linhaFundida + "\n"; 
            i++; 
        } else { 
            resultado += lAtual + "\n"; 
        }
    }
    dom.conteudoParte.value = resultado.trim();
    fecharConversor();
}

function adicionarNovaParte() {
    const id = dom.idParte.value.trim();
    const t = dom.tituloParte.value.trim();
    const c = dom.conteudoParte.value.trim();
    const cor = dom.corParte.value;
    const index = parseInt(dom.editIndex.value, 10);
    
    if (!id || !t || !c) return mostrarToast("Preencha todos os campos da seção!");
    
    if(index === -1) {
        bancoDePartes.push({ id, t, c, cor });
    } else {
        const oldId = bancoDePartes[index].id;
        bancoDePartes[index] = { id, t, c, cor };
        mapaAtual.forEach(inst => { 
            if(inst.id === oldId) { inst.id = id; inst.t = t; inst.c = c; inst.cor = cor; } 
        });
        dom.editIndex.value = "-1";
        dom.btnSalvar.innerText = "+ Salvar Seção";
        dom.btnSalvar.style.background = "var(--cor-sucesso)";
    }
    
    dom.idParte.value = ''; dom.tituloParte.value = ''; dom.conteudoParte.value = '';
    atualizarUI();
}

function editarParte(index) {
    const p = bancoDePartes[index];
    dom.idParte.value = p.id;
    dom.tituloParte.value = p.t;
    dom.conteudoParte.value = p.c;
    dom.corParte.value = p.cor;
    dom.editIndex.value = index;
    dom.btnSalvar.innerText = "Atualizar Seção";
    dom.btnSalvar.style.background = "var(--cor-alerta)"; 
}

function excluirParte(index) {
    if(confirm("Excluir seção? Isso removerá a parte da estrutura da música também.")) {
        const idRemovido = bancoDePartes[index].id;
        bancoDePartes.splice(index, 1);
        mapaAtual = mapaAtual.filter(inst => inst.id !== idRemovido);
        atualizarUI();
    }
}

function atualizarUI() {
    if(bancoDePartes.length === 0) {
        dom.listaPartes.innerHTML = `<div style="color: var(--text-claro); text-align: center; margin-top: 50px; font-size: 14px;">Nenhuma seção criada ainda.</div>`;
        dom.paleta.innerHTML = '';
        return;
    }

    let htmlLista = ''; 
    let htmlPaleta = '';
    
    bancoDePartes.forEach((parte, i) => {
        // Inclui o drag-handle-banco para reordenação com ícone indicativo
        htmlLista += `
            <div class="item-parte" style="border-left-color:${parte.cor}; display:flex; align-items:center; gap:12px;">
                <div class="drag-handle-banco" title="Arraste para reordenar">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"></path></svg>
                </div>
                <span style="flex:1;"><strong style="color:var(--text-mutado);">(${parte.id})</strong> ${parte.t}</span>
                <div style="display:flex; gap:6px;">
                    <button class="btn-mini btn-edit" onclick="editarParte(${i})">✎</button>
                    <button class="btn-mini btn-del" onclick="excluirParte(${i})">✖</button>
                </div>
            </div>`;
            
        htmlPaleta += `<div class="bolinha" style="border-color:${parte.cor};" onclick="adicionarAoMapa(${i})" title="Adicionar ${parte.t}">${parte.id}</div>`;
    });
    
    dom.listaPartes.innerHTML = htmlLista;
    dom.paleta.innerHTML = htmlPaleta;
}

function adicionarAoMapa(indexBanco) {
    const parte = bancoDePartes[indexBanco];
    mapaAtual.push({ ...parte, com: '', mesclar: false, ocultar: false });
    renderizarTimeline();
    
    const caixaTimeline = document.querySelector('.caixa-timeline');
    if (caixaTimeline) {
        setTimeout(() => { caixaTimeline.scrollTop = caixaTimeline.scrollHeight; }, 50);
    }
}

window.excluirGrupoDoMapa = function(startIdx, count) {
    mapaAtual.splice(startIdx, count);
    renderizarTimeline();
};

function renderizarTimeline() {
    mapGroupsGlobais = [];
    let currentGroup = [];
    mapaAtual.forEach(inst => {
        if (currentGroup.length > 0 && currentGroup[currentGroup.length-1].id === inst.id) {
            currentGroup.push(inst);
        } else { 
            if (currentGroup.length > 0) mapGroupsGlobais.push(currentGroup);
            currentGroup = [inst];
        }
    });
    if (currentGroup.length > 0) mapGroupsGlobais.push(currentGroup);

    if (mapGroupsGlobais.length === 0) {
        dom.previewMapa.innerHTML = `<span class="nao-arrastavel" style="color:var(--text-claro); font-size:13px; margin:auto;">A estrutura da música aparecerá aqui.</span>`;
    } else {
        let htmlPreview = ''; 
        let countStart = 0; 
        
        mapGroupsGlobais.forEach((grupo, idx) => {
            const item = grupo[0]; 
            const count = grupo.length;
            htmlPreview += `
                <div class="bolinha-wrapper" data-group-index="${idx}">
                    <button class="btn-excluir-preview" onclick="excluirGrupoDoMapa(${countStart}, ${count})" title="Excluir grupo do mapa">×</button>
                    <div class="bolinha-preview" style="border-color:${item.cor};" title="Arraste para mover o grupo inteiro">
                        ${item.id}
                    </div>
                    ${count > 1 ? `<div class="expoente-repeticao">${count}</div>`:''}
                </div>`;
            countStart += count;
        });
        dom.previewMapa.innerHTML = htmlPreview;
    }

    let htmlTimeline = '';
    mapaAtual.forEach((inst, i) => {
        const isRep = i > 0 && mapaAtual[i-1].id === inst.id;
        htmlTimeline += `
            <div class="item-linha-tempo">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
                    <div class="drag-handle" title="Arraste para reordenar">
                        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"></path></svg>
                    </div>
                    <div class="mini-bolinha" style="border-color:${inst.cor};">${inst.id}</div>
                    <strong style="color:var(--text-padrao);">${inst.t}</strong>
                    <button onclick="mapaAtual.splice(${i},1); renderizarTimeline()" style="margin-left:auto; cursor:pointer; color:var(--cor-perigo); border:none; background:none; font-weight:bold; font-size:16px;">×</button>
                </div>
                <textarea class="area-comentario" placeholder="Dinâmica / Comentários (ex: Todos juntos, Bateria forte...)" oninput="mapaAtual[${i}].com = this.value">${inst.com || ''}</textarea>
                
                <div style="display:flex; gap:20px; margin-top:12px; flex-wrap: wrap;">
                    ${isRep ? `<label class="checkbox-label"><input type="checkbox" onchange="mapaAtual[${i}].mesclar = this.checked; renderizarTimeline()" ${inst.mesclar ? 'checked' : ''}> Mesclar repetição no mesmo balão</label>` : ''}
                    <label class="checkbox-label" style="${inst.mesclar ? 'opacity:0.4; pointer-events:none;' : ''}"><input type="checkbox" onchange="mapaAtual[${i}].ocultar = this.checked" ${inst.ocultar ? 'checked' : ''}> Ocultar balão na impressão</label>
                </div>
            </div>
        `;
    });
    dom.linhaTempo.innerHTML = htmlTimeline;
}

function compilarCifra(texto) {
    if (!texto) return ''; 
    let htmlCompilado = '';
    texto.split('\n').forEach(linha => {
        if(!linha.trim()){ 
            htmlCompilado += "<div style='height:0.8em;'></div>"; 
            return; 
        }
        
        htmlCompilado += "<div class='linha-musica'>";
        let partes = linha.split(/(\[[^\]]+\])/);
        let acordeAtual = "";
        
        partes.forEach(p => {
            if (p.startsWith('[') && p.endsWith(']')) {
                acordeAtual = p.slice(1,-1);
            } else if (p) {
                htmlCompilado += `<div class='bloco-acorde'><span class='acorde'>${acordeAtual}</span><span class='letra'>${p}</span></div>`;
                acordeAtual = "";
            }
        });
        if (acordeAtual) {
            htmlCompilado += `<div class='bloco-acorde'><span class='acorde'>${acordeAtual}</span><span class='letra'>&nbsp;</span></div>`;
        }
        
        htmlCompilado += "</div>";
    });
    return htmlCompilado;
}

// ================= GERAÇÃO DO DOCUMENTO A4 E IMPRESSÃO =================
function gerarHtmlHeader() {
    let displayMap = [];
    mapaAtual.forEach(inst => {
        if (displayMap.length > 0 && displayMap[displayMap.length-1].id === inst.id) {
            displayMap[displayMap.length-1].count++;
        } else { 
            displayMap.push({ ...inst, count: 1 }); 
        }
    });
    
    let htmlMapa = '';
    displayMap.forEach(item => {
        htmlMapa += `
            <div class="bolinha-wrapper">
                <div class="bolinha-impressa" style="border-color:${item.cor};">${item.id}</div>
                ${item.count > 1 ? `<div class="expoente-repeticao">${item.count}</div>`:''}
            </div>`;
    });

    return `
        <div class="cabecalho-musica">
            <div style="flex: 1; min-width: 0; padding-right: 0px;">
                <h1 class="titulo-musica">${dom.inputTitulo.value}</h1>
                <p style="color:#888; margin:0;">${dom.inputAutor.value}</p>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0;">
                <div class="meta-dados">
                    <div>Tom: <span>${dom.inputTom.value}</span></div>
                    <div>Andamento: <span>${dom.inputBpm.value}</span></div>
                    <div>Compasso: <span>${dom.inputCompasso.value}</span></div>
                </div>
            </div>
        </div>
        <div class="mapa-impresso">${htmlMapa}</div>
    `;
}

function criarPaginaA4(isFirst, pageNum) {
    const page = document.createElement('div');
    page.className = 'pagina-a4';
    
    let headerHtml = isFirst ? gerarHtmlHeader() : '';

    page.innerHTML = `
        ${headerHtml}
        <div class="pagina-a4-conteudo"></div>
        <div class="rodape-pagina" data-page="${pageNum}"></div>
    `;
    
    dom.docContainer.appendChild(page);
    return page;
}

function gerarDocumento() {
    dom.docContainer.innerHTML = ''; 
    
    let baloes = [];
    mapaAtual.forEach(inst => {
        if (inst.ocultar) return; 
        if (baloes.length > 0 && baloes[baloes.length-1].id === inst.id && inst.mesclar) {
            baloes[baloes.length-1].count++;
            if (inst.com) baloes[baloes.length-1].coms.push(inst.com);
        } else { 
            baloes.push({ ...inst, count: 1, coms: inst.com ? [inst.com] : [] }); 
        }
    });
    
    let pageNum = 1;
    let currentPage = criarPaginaA4(true, pageNum);
    let contentEl = currentPage.querySelector('.pagina-a4-conteudo');

    baloes.forEach(b => {
        const strComentarios = b.coms.join('<br>');
        const comHtml = strComentarios ? `<div class="comentario-container"><div class="comentario-pdf">${strComentarios}</div></div>` : '';
        const repHtml = b.count > 1 ? `(${b.count}X)` : '';
        const textoSemAcordes = b.c.replace(/\[.*?\]/g, '').trim();
        const classSoCifra = textoSemAcordes.length > 0 ? '' : 'so-cifra';

        const divBalao = document.createElement('div');
        divBalao.className = `secao`;
        divBalao.innerHTML = `
            <div class="cabecalho-balao">
                <div class="titulo-secao">
                    <div class="mini-bolinha" style="border-color:${b.cor}; color:#000 !important;">${b.id}</div>
                    ${b.t} ${repHtml}
                </div>
                ${comHtml}
            </div>
            <div class="secao-conteudo ${classSoCifra}">
                ${compilarCifra(b.c)}
            </div>
        `;
        
        contentEl.appendChild(divBalao);

        // Verifica transbordo dinâmico para garantir que tudo caiba na folha
        const excedeuLimite = contentEl.scrollWidth > contentEl.clientWidth + 5;
        
        if (excedeuLimite && contentEl.children.length > 1) {
            contentEl.removeChild(divBalao);
            pageNum++;
            currentPage = criarPaginaA4(false, pageNum);
            contentEl = currentPage.querySelector('.pagina-a4-conteudo');
            contentEl.appendChild(divBalao);
        }
    });

    document.querySelectorAll('.rodape-pagina').forEach(f => {
        const p = f.getAttribute('data-page');
        f.innerText = `Página ${p} de ${pageNum}`;
    });
}

function imprimirA4() {
    const conteudoFormatado = dom.docContainer.innerHTML;

    let iframe = document.getElementById('iframe-impressao');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'iframe-impressao';
        iframe.style.position = 'absolute';
        iframe.style.width = '0px'; 
        iframe.style.height = '0px'; 
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow.document;
    doc.open();
    // Injeta a estrutura exata do estilo de impressão para o iframe nativo
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Cifra A4</title>
            <style>
                @page { size: A4; margin: 0; }
                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
                body { font-family: 'Inter', system-ui, sans-serif; margin: 0; padding: 0; background: white; color: black; }

                .pagina-a4 {
                    width: 210mm; height: 297mm; padding: 6mm; margin: 0; box-shadow: none;
                    display: flex; flex-direction: column; position: relative; overflow: hidden;
                    page-break-after: always; break-after: page;
                }
                .pagina-a4:last-child { page-break-after: auto; break-after: auto; }

                .pagina-a4-conteudo { column-count: 2; column-gap: 30px; column-fill: auto; flex: 1; width: 100%; overflow: hidden; }

                .rodape-pagina { text-align: right; font-size: 11px; color: #94a3b8; padding-top: 10px; margin-top: auto; flex-shrink: 0; font-weight: 600; }

                .cabecalho-musica { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #eee; padding-bottom: 10px; margin: 15px 20px 20px 20px; }
                .titulo-musica { font-size: 24px; font-weight: 800; margin: 0; }
                .meta-dados { display: flex; gap: 20px; font-size: 12px; color: #666; font-weight: bold; }
                .meta-dados span { color: #000; font-weight: normal; margin-left: 4px; }
                .mapa-impresso { display: flex; gap: 12px; flex-wrap: wrap; margin: 0 15px 20px 20px; }
                .bolinha-wrapper { position: relative; display: inline-block; }
                .bolinha-impressa { width: 22px; height: 22px; border-radius: 50%; border: 2px solid; display: flex; justify-content: center; align-items: center; font-weight: bold; background: white; color: #000 !important; font-size: 10px; z-index: 1; position: relative; }
                .expoente-repeticao { position: absolute; top: -5px; right: -5px; font-size: 11px; font-weight: 900; color: #000; z-index: 2; background: white; border-radius: 50%; padding: 0 2px; }

                .secao { 
                    position: relative; display: inline-block; width: 100%; border: 2px solid #e0e0e0; 
                    border-radius: 12px; padding: 16px 15px 8px 15px; margin-top: 16px; margin-bottom: 8px; 
                    background: white; break-inside: avoid; page-break-inside: avoid;
                }
                
                .cabecalho-balao { display: block; width: 100%; }
                .linha-musica { display: flex; flex-wrap: wrap; margin-bottom: 8px; break-inside: avoid; page-break-inside: avoid; } 

                .titulo-secao { position: absolute; top: -14px; left: 12px; font-weight: bold; background: white; padding: 0 10px 0 5px; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
                .mini-bolinha { width: 22px; height: 22px; border-radius: 50%; border: 2.5px solid; display: flex; justify-content: center; align-items: center; font-weight: 700; background: white; color: #000 !important; font-size: 9px; }
                
                .comentario-container { display: block; width: 100%; padding-top: 0; text-align: right; margin-bottom: 2px; }
                .comentario-pdf { color: #666; font-size: 13px; font-style: normal; white-space: pre-wrap; word-break: break-word; line-height: 1.3; text-align: right; }

                .secao-conteudo { padding-top: 5px; padding-bottom: 6px; display: flex; flex-direction: column; }
                .bloco-acorde { display: flex; flex-direction: column; justify-content: flex-end; }
                .acorde { font-weight: bold; font-size: 13px; color: #000; line-height: 1; margin-bottom: 2px; margin-right: 5px; }
                .letra { font-size: 13px; color: #333; white-space: pre; line-height: 1.1; }
                .so-cifra .letra { display: none; }
                .so-cifra .acorde { margin-right: 6px; }
                .so-cifra .bloco-acorde { margin-right: 0px; }
                .secao-conteudo.so-cifra { padding-top: 6px; padding-bottom: 0px; display: flex; flex-direction: column; }
            </style>
        </head>
        <body>
            ${conteudoFormatado}
        </body>
        </html>
    `);
    doc.close();

    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, 250);
}
// ================= SISTEMA DE TOAST E TEMA ESCURO =================
function mostrarToast(mensagem) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = mensagem;
    toast.classList.add('mostrar');
    setTimeout(() => {
        toast.classList.remove('mostrar');
    }, 3000);
}

function toggleDarkMode() {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem('temaCifrasStudio', isDark ? 'escuro' : 'claro');
}
// ================= GESTOS MOBILE (SWIPE PARA MENU) =================
let toqueInicialX = 0;
let toqueInicialY = 0;

document.addEventListener('touchstart', function(e) {
    toqueInicialX = e.changedTouches[0].screenX;
    toqueInicialY = e.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', function(e) {
    const toqueFinalX = e.changedTouches[0].screenX;
    const toqueFinalY = e.changedTouches[0].screenY;
    
    const distanciaX = toqueFinalX - toqueInicialX;
    const distanciaY = Math.abs(toqueFinalY - toqueInicialY);
    
    // Garante que o usuário arrastou para o lado, e não rolando a tela para baixo
    if (distanciaY < 50) {
        
        // 1. Puxar da esquerda para a direita (Abrir menu)
        // Só ativa se o puxão começar perto da borda esquerda (< 50px) para não abrir sem querer ao digitar
        if (distanciaX > 60 && toqueInicialX < 50) {
            dom.sidebar.classList.remove('fechado');
        }
        
        // 2. Puxar da direita para a esquerda (Fechar menu)
        else if (distanciaX < -60 && !dom.sidebar.classList.contains('fechado')) {
            dom.sidebar.classList.add('fechado');
        }
    }
}, { passive: true });
