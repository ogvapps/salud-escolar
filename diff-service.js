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
    const rawGroup = (row['Grupo'] || row['Curso'] || '').trim();
    const rawStatus = (row['Estado'] || row['Gravedad'] || row['Severidad'] || row['Riesgo'] || '').toLowerCase().trim();
    const rawInfo = (row['Observaciones'] || row['Información'] || row['Patología'] || row['Info'] || 'Sin datos').trim();

    if (!rawName) return null;

    let stage = 'Primaria';
    const groupLower = rawGroup.toLowerCase();
    if (groupLower.includes('infantil') || groupLower.includes('inf')) {
        stage = 'Infantil';
    } else if (groupLower.includes('eso') || groupLower.includes('secundaria')) {
        stage = 'ESO';
    } else if (groupLower.includes('primaria') || groupLower.includes('pri')) {
        stage = 'Primaria';
    }

    let course = rawGroup;
    if (rawGroup.includes('_')) {
        const parts = rawGroup.split('_');
        const num = parts[0];
        course = `${num}º ${stage}`;
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

    // Infantil
    if (/^1[ºo\.]?\s*infantil/i.test(courseTrimmed)) {
        return { stage: "Infantil", course: "2º Infantil", isGraduate: false };
    }
    if (/^2[ºo\.]?\s*infantil/i.test(courseTrimmed)) {
        return { stage: "Infantil", course: "3º Infantil", isGraduate: false };
    }
    if (/^3[ºo\.]?\s*infantil/i.test(courseTrimmed)) {
        return { stage: "Primaria", course: "1º Primaria", isGraduate: false };
    }

    // Primaria
    if (/^1[ºo\.]?\s*primaria/i.test(courseTrimmed)) {
        return { stage: "Primaria", course: "2º Primaria", isGraduate: false };
    }
    if (/^2[ºo\.]?\s*primaria/i.test(courseTrimmed)) {
        return { stage: "Primaria", course: "3º Primaria", isGraduate: false };
    }
    if (/^3[ºo\.]?\s*primaria/i.test(courseTrimmed)) {
        return { stage: "Primaria", course: "4º Primaria", isGraduate: false };
    }
    if (/^4[ºo\.]?\s*primaria/i.test(courseTrimmed)) {
        return { stage: "Primaria", course: "5º Primaria", isGraduate: false };
    }
    if (/^5[ºo\.]?\s*primaria/i.test(courseTrimmed)) {
        return { stage: "Primaria", course: "6º Primaria", isGraduate: false };
    }
    if (/^6[ºo\.]?\s*primaria/i.test(courseTrimmed)) {
        return { stage: "ESO", course: "1º ESO", isGraduate: false };
    }

    // ESO
    if (/^1[ºo\.]?\s*eso/i.test(courseTrimmed)) {
        return { stage: "ESO", course: "2º ESO", isGraduate: false };
    }
    if (/^2[ºo\.]?\s*eso/i.test(courseTrimmed)) {
        return { stage: "ESO", course: "3º ESO", isGraduate: false };
    }
    if (/^3[ºo\.]?\s*eso/i.test(courseTrimmed)) {
        return { stage: "ESO", course: "4º ESO", isGraduate: false };
    }
    if (/^4[ºo\.]?\s*eso/i.test(courseTrimmed)) {
        return { stage: "Graduado", course: "Egresado", isGraduate: true };
    }

    // Cursos con letras de grupo (ej: "1º A Infantil", "3º B Primaria")
    const match = courseTrimmed.match(/^(\d+)[ºo\.]?\s*([A-Za-z]?)\s*(infantil|primaria|eso)/i);
    if (match) {
        const num = parseInt(match[1], 10);
        const letter = match[2] ? ` ${match[2].toUpperCase()}` : '';
        const rawStage = match[3].toLowerCase();

        if (rawStage === 'infantil') {
            if (num < 3) return { stage: "Infantil", course: `${num + 1}º${letter} Infantil`, isGraduate: false };
            if (num === 3) return { stage: "Primaria", course: `1º${letter} Primaria`, isGraduate: false };
        } else if (rawStage === 'primaria') {
            if (num < 6) return { stage: "Primaria", course: `${num + 1}º${letter} Primaria`, isGraduate: false };
            if (num === 6) return { stage: "ESO", course: `1º${letter} ESO`, isGraduate: false };
        } else if (rawStage === 'eso') {
            if (num < 4) return { stage: "ESO", course: `${num + 1}º${letter} ESO`, isGraduate: false };
            if (num === 4) return { stage: "Graduado", course: "Egresado", isGraduate: true };
        }
    }

    return { stage: currentStage, course: currentCourse, isGraduate: false, unknown: true };
}

/**
 * Compara los alumnos actuales frente a las filas importadas del nuevo Excel.
 */
export function calculateStudentsDiff(currentStudents, importedRows) {
    const parsedImported = [];
    importedRows.forEach(row => {
        const parsed = parseImportedRow(row);
        if (parsed) parsedImported.push(parsed);
    });

    const currentMap = new Map();
    currentStudents.forEach(st => {
        const normKey = normalizeName(st.name);
        currentMap.set(normKey, st);
    });

    const newStudents = [];
    const modifiedStudents = [];
    const unchangedStudents = [];
    const matchedCurrentKeys = new Set();

    parsedImported.forEach(imp => {
        const normKey = normalizeName(imp.name);
        const existing = currentMap.get(normKey);

        if (!existing) {
            newStudents.push(imp);
        } else {
            matchedCurrentKeys.add(normKey);

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

    // Alumnos que estaban en la base de datos pero no figuran en el Excel entrante
    const removedStudents = [];
    currentStudents.forEach(st => {
        const normKey = normalizeName(st.name);
        if (!matchedCurrentKeys.has(normKey)) {
            removedStudents.push(st);
        }
    });

    return {
        newStudents,
        modifiedStudents,
        unchangedStudents,
        removedStudents,
        totalIncoming: parsedImported.length,
        totalCurrent: currentStudents.length
    };
}
