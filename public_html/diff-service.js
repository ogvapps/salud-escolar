/**
 * diff-service.js
 * Módulo para cálculo de diferencias (diff) e inteligencia de sincronización de fichas de salud escolar
 */

/**
 * Normaliza nombres para comparación flexible (elimina tildes, puntuación y dobles espacios).
 */
export function normalizeName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Parsea una fila de Excel a la estructura estandarizada de un alumno.
 */
export function parseImportedRow(row) {
    const rawName = (row['Nombre del Alumno/a'] || row['Nombre'] || row['Alumno'] || row['Nombre y Apellidos'] || '').trim();
    let rawGroup = (row['Grupo'] || row['Curso'] || row['Clase'] || '').trim();
    const rawStageCol = (row['Etapa'] || row['Nivel'] || '').trim();
    const rawStatus = (row['Estado'] || row['Gravedad'] || row['Severidad'] || row['Riesgo'] || '').toLowerCase().trim();
    const rawInfo = (row['Observaciones'] || row['Información'] || row['Patología'] || row['Info'] || 'Sin datos').trim();

    if (!rawName) return null;

    let stage = 'Primaria';
    const groupLower = rawGroup.toLowerCase();
    const stageLower = rawStageCol.toLowerCase();

    if (stageLower.includes('infantil') || groupLower.includes('infantil') || groupLower.includes('inf')) {
        stage = 'Infantil';
    } else if (stageLower.includes('eso') || stageLower.includes('secundaria') || groupLower.includes('eso') || groupLower.includes('secundaria')) {
        stage = 'ESO';
    } else if (stageLower.includes('primaria') || groupLower.includes('primaria') || groupLower.includes('pri')) {
        stage = 'Primaria';
    }

    let course = rawGroup;
    if (rawGroup.includes('_')) {
        const parts = rawGroup.split('_').filter(Boolean);
        const num = parts[0];
        const lastPart = parts.length > 1 ? parts[parts.length - 1] : '';
        const letter = (lastPart.length === 1 && /[A-Za-z]/.test(lastPart)) ? ` ${lastPart.toUpperCase()}` : '';
        course = `${num}º${letter} ${stage}`;
    }

    let severity = 'low';
    if (rawStatus === 'rojo' || rawStatus === 'alta' || rawStatus === 'alto' || rawStatus === 'high') {
        severity = 'high';
    } else if (rawStatus === 'amarillo' || rawStatus === 'media' || rawStatus === 'medio' || rawStatus === 'medium') {
        severity = 'medium';
    }

    return {
        name: rawName,
        stage,
        course,
        severity,
        info: rawInfo || 'Sin datos'
    };
}

/**
 * Calcula el siguiente curso escolar y etapa según la escalera educativa reglamentaria.
 */
export function getPromotedCourse(currentStage, currentCourse) {
    const courseTrimmed = (currentCourse || '').trim();
    if (!courseTrimmed) {
        return { stage: currentStage, course: currentCourse, isGraduate: false, unknown: true };
    }

    // 1. Mapeo estándar directo
    const standardMap = {
        // Infantil
        "1º Infantil": { stage: "Infantil", course: "2º Infantil", isGraduate: false },
        "2º Infantil": { stage: "Infantil", course: "3º Infantil", isGraduate: false },
        "3º Infantil": { stage: "Primaria", course: "1º Primaria", isGraduate: false },
        // Primaria
        "1º Primaria": { stage: "Primaria", course: "2º Primaria", isGraduate: false },
        "2º Primaria": { stage: "Primaria", course: "3º Primaria", isGraduate: false },
        "3º Primaria": { stage: "Primaria", course: "4º Primaria", isGraduate: false },
        "4º Primaria": { stage: "Primaria", course: "5º Primaria", isGraduate: false },
        "5º Primaria": { stage: "Primaria", course: "6º Primaria", isGraduate: false },
        "6º Primaria": { stage: "ESO", course: "1º ESO", isGraduate: false },
        // ESO
        "1º ESO": { stage: "ESO", course: "2º ESO", isGraduate: false },
        "2º ESO": { stage: "ESO", course: "3º ESO", isGraduate: false },
        "3º ESO": { stage: "ESO", course: "4º ESO", isGraduate: false },
        "4º ESO": { stage: "Graduado", course: "Egresado", isGraduate: true }
    };

    if (standardMap[courseTrimmed]) {
        return standardMap[courseTrimmed];
    }

    // 2. Mapeo flexible para grupos con letra o sufijo (ej: "1º A Infantil", "1º Primaria A", "3º B")
    let stage = currentStage || 'Primaria';
    const lower = courseTrimmed.toLowerCase();
    if (lower.includes('infantil')) stage = 'Infantil';
    else if (lower.includes('eso') || lower.includes('secundaria')) stage = 'ESO';
    else if (lower.includes('primaria')) stage = 'Primaria';

    const numMatch = courseTrimmed.match(/(\d+)/);
    if (!numMatch) {
        return { stage, course: currentCourse, isGraduate: false, unknown: true };
    }
    const num = parseInt(numMatch[1], 10);

    // Extraer letra de grupo si existe (ej. 'A', 'B', 'C')
    const cleanTokens = courseTrimmed
        .replace(/infantil|primaria|secundaria|eso/gi, '')
        .replace(/\d+[ºo\.]?/gi, '')
        .trim();
    const letterMatch = cleanTokens.match(/\b([A-Za-z])\b/);
    const letter = letterMatch ? ` ${letterMatch[1].toUpperCase()}` : '';

    if (stage === 'Infantil') {
        if (num < 3) return { stage: "Infantil", course: `${num + 1}º${letter} Infantil`, isGraduate: false };
        if (num === 3) return { stage: "Primaria", course: `1º${letter} Primaria`, isGraduate: false };
    } else if (stage === 'Primaria') {
        if (num < 6) return { stage: "Primaria", course: `${num + 1}º${letter} Primaria`, isGraduate: false };
        if (num === 6) return { stage: "ESO", course: `1º${letter} ESO`, isGraduate: false };
    } else if (stage === 'ESO') {
        if (num < 4) return { stage: "ESO", course: `${num + 1}º${letter} ESO`, isGraduate: false };
        if (num === 4) return { stage: "Graduado", course: "Egresado", isGraduate: true };
    }

    return { stage: currentStage, course: currentCourse, isGraduate: false, unknown: true };
}

/**
 * Compara los alumnos actuales frente a las filas importadas del nuevo Excel.
 * Soporta homónimos y desambigua por curso/etapa sin sobreescrituras destructivas.
 */
export function calculateStudentsDiff(currentStudents, importedRows) {
    const parsedImported = [];
    importedRows.forEach(row => {
        const parsed = parseImportedRow(row);
        if (parsed) parsedImported.push(parsed);
    });

    // Agrupar alumnos existentes por nombre normalizado (soporte para homónimos)
    const currentByNormName = new Map();
    currentStudents.forEach(st => {
        const normKey = normalizeName(st.name);
        if (!currentByNormName.has(normKey)) {
            currentByNormName.set(normKey, []);
        }
        currentByNormName.get(normKey).push(st);
    });

    const newStudents = [];
    const modifiedStudents = [];
    const unchangedStudents = [];
    const matchedCurrentIds = new Set();

    parsedImported.forEach(imp => {
        const normKey = normalizeName(imp.name);
        const candidates = currentByNormName.get(normKey) || [];

        // Buscar el mejor candidato no emparejado aún:
        // 1º coincidencia en curso exacto, 2º coincidencia en etapa, 3º primer candidato disponible
        let existing = candidates.find(c => !matchedCurrentIds.has(c.id) && c.course === imp.course);
        if (!existing) {
            existing = candidates.find(c => !matchedCurrentIds.has(c.id) && c.stage === imp.stage);
        }
        if (!existing) {
            existing = candidates.find(c => !matchedCurrentIds.has(c.id));
        }

        if (!existing) {
            newStudents.push(imp);
        } else {
            matchedCurrentIds.add(existing.id);

            const changes = {};
            if (existing.course !== imp.course) {
                changes.course = { from: existing.course, to: imp.course };
            }
            if (existing.stage !== imp.stage) {
                changes.stage = { from: existing.stage, to: imp.stage };
            }
            if (existing.severity !== imp.severity) {
                changes.severity = { from: existing.severity, to: imp.severity };
            }
            // Comparar información médica limpiando espacios
            if ((existing.info || '').trim() !== (imp.info || '').trim()) {
                changes.info = { from: existing.info || '', to: imp.info || '' };
            }

            if (Object.keys(changes).length > 0) {
                modifiedStudents.push({
                    id: existing.id,
                    name: existing.name,
                    incoming: imp,
                    existing: existing,
                    changes: changes
                });
            } else {
                unchangedStudents.push({
                    id: existing.id,
                    name: existing.name,
                    student: existing
                });
            }
        }
    });

    // Alumnos que estaban en la base de datos pero no fueron emparejados con el Excel entrante
    const removedStudents = currentStudents.filter(st => !matchedCurrentIds.has(st.id));

    return {
        newStudents,
        modifiedStudents,
        unchangedStudents,
        removedStudents,
        totalIncoming: parsedImported.length,
        totalCurrent: currentStudents.length
    };
}
