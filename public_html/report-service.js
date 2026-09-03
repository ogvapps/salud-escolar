export function generateReportData(students) {
    if (!students || students.length === 0) {
        return {};
    }

    const groupedData = students.reduce((acc, student) => {
        const { stage, course } = student;
        if (!acc[stage]) acc[stage] = {};
        if (!acc[stage][course]) acc[stage][course] = [];
        acc[stage][course].push(student);
        return acc;
    }, {});

    const newReportData = {};

    for (const stage in groupedData) {
        newReportData[stage] = {};
        for (const course in groupedData[stage]) {
            const courseStudents = groupedData[stage][course];

            const summary = { high: 0, medium: 0, low: 0 };
            const highRiskStudents = [];
            const mediumRiskStudents = [];

            courseStudents.forEach(student => {
                if (student.severity === 'high') {
                    summary.high++;
                    highRiskStudents.push(student);
                } else if (student.severity === 'medium') {
                    summary.medium++;
                    mediumRiskStudents.push(student);
                } else {
                    summary.low++;
                }
            });

            let analysis = '';
            const recommendations = new Set();

            if (summary.high > 0) {
                const highRiskConditions = highRiskStudents.map(s => summarizeCondition(s.info)).join(', ');
                analysis = `Esta es una clase de muy alto riesgo con ${summary.high} estudiante(s) con condiciones severas (${highRiskConditions}) que requieren atención constante.`;
            } else if (summary.medium > 0) {
                analysis = `Riesgo moderado con ${summary.medium} estudiante(s) que requieren atención para condiciones como asma, alergias estacionales u otras patologías manejables.`;
            } else {
                analysis = 'Clase de bajo riesgo. No se han reportado patologías significativas que requieran atención especial.';
            }

            if (summary.high === 0 && summary.medium === 0) {
                recommendations.add("Vigilancia General: Mantener la observación estándar para detectar cualquier síntoma o malestar no diagnosticado.");
                recommendations.add("Actualización de Datos: Animar a los padres a comunicar cualquier cambio en la salud de sus hijos a lo largo del curso.");
            } else {
                recommendations.add("Revisión de Protocolos: Asegurarse de que todo el personal conozca los planes de acción individuales de los estudiantes con riesgo.");
            }


            highRiskStudents.forEach(student => {
                const condition = summarizeCondition(student.info).toLowerCase();
                if (condition.includes('diabetes')) {
                    recommendations.add(`Protocolo de Diabetes (Crítico): El personal debe conocer el protocolo de actuación ante una hipoglucemia para ${student.name}.`);
                } else if (condition.includes('alergia') && (condition.includes('frutos secos') || condition.includes('pescado') || condition.includes('huevo') || condition.includes('leche') || condition.includes('anafilaxia') || condition.includes('pipas'))) {
                    recommendations.add(`Medicación de Emergencia (Crítico): La medicación (adrenalina/urbason) para ${student.name} debe ser accesible y el personal debe saber administrarla.`);
                    recommendations.add(`Zona Libre de Alérgenos: Implementar una política estricta de "no compartir alimentos" para proteger a ${student.name}.`);
                } else if (condition.includes('epilepsia')) {
                    recommendations.add(`Protocolo de Epilepsia (Crítico): El personal debe estar formado sobre cómo actuar ante una crisis epiléptica de ${student.name}.`);
                } else if (condition.includes('cardíaco') || condition.includes('aórtica') || condition.includes('corazón')) {
                    recommendations.add(`Vigilancia Cardíaca: Supervisar de cerca a ${student.name} durante el esfuerzo físico y conocer los signos de fatiga o malestar.`);
                } else if (condition.includes('sangrado') || condition.includes('hospital')) {
                    recommendations.add(`Protocolo de Sangrado (Urgente): Conocer la indicación específica para ${student.name} y actuar rápidamente.`);
                } else {
                    recommendations.add(`Atención Máxima para ${student.name}: Revisar en detalle la ficha de ${student.name} para conocer su condición específica y el plan de actuación.`);
                }
            });

            mediumRiskStudents.forEach(student => {
                const condition = summarizeCondition(student.info).toLowerCase();
                if (condition.includes('asma')) {
                    recommendations.add(`Manejo del Asma: Conocer los desencadenantes y el uso correcto de inhaladores para ${student.name}, especialmente durante la actividad física.`);
                } else if (condition.includes('alergia')) {
                    recommendations.add(`Control de Alergias: Estar atentos a los síntomas de alergia de ${student.name} y tener a mano antihistamínicos si están prescritos.`);
                } else if (condition.includes('tdah') || condition.includes('autista') || condition.includes('tda')) {
                    recommendations.add(`Apoyo a la Neurodiversidad: Ofrecer apoyo y estrategias adecuadas para ${student.name}.`);
                } else if (condition.includes('piel atópica') || condition.includes('dermatitis')) {
                    recommendations.add(`Cuidado de la Piel: Estar atentos a los brotes de ${student.name} y evitar los desencadenantes conocidos.`);
                }
            });

            newReportData[stage][course] = {
                summary,
                analysis,
                recommendations: Array.from(recommendations)
            };
        }
    }

    return newReportData;
}

export function summarizeCondition(info) {
    const lines = info.split('\n');
    const diseaseLine = lines.find(line => line.toLowerCase().startsWith('enfermedad:'));
    if (diseaseLine) {
        return diseaseLine.substring('enfermedad:'.length).trim().split(/,|\./)[0];
    }
    const infoLine = lines.find(line => line.toLowerCase().startsWith('información:'));
    if (infoLine) {
        return infoLine.substring('información:'.length).trim().split(/,|\./)[0];
    }
    return info.split(/,|\./)[0];
}
