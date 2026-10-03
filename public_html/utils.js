export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function showModal(message, type = 'info') {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-gray-900/60 backdrop-blur-sm overflow-y-auto h-full w-full flex items-center justify-center z-50 p-4';
    let icon = '';
    let bgColor = 'bg-white';
    let textColor = 'text-gray-800';

    switch (type) {
        case 'success':
            icon = '<i class="fas fa-check-circle text-green-500 text-3xl"></i>';
            break;
        case 'error':
            icon = '<i class="fas fa-times-circle text-red-500 text-3xl"></i>';
            break;
        default:
            icon = '<i class="fas fa-info-circle text-blue-500 text-3xl"></i>';
    }

    modal.innerHTML = `
        <div class="${bgColor} p-6 sm:p-8 rounded-2xl shadow-2xl text-center w-full max-w-sm transform transition-all duration-300">
            <div class="mb-4">${icon}</div>
            <p class="mb-6 text-base sm:text-lg font-medium ${textColor} break-words">${escapeHtml(message)}</p>
            <button class="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-semibold min-h-[44px]">Cerrar</button>
        </div>
    `;
    modal.querySelector('button').onclick = () => modal.remove();
    document.body.appendChild(modal);
}

export function showConfirmationModal(message, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-gray-900/60 backdrop-blur-sm overflow-y-auto h-full w-full flex items-center justify-center z-50 p-4';

    modal.innerHTML = `
        <div class="bg-white p-6 sm:p-8 rounded-2xl shadow-2xl text-center w-full max-w-md transform transition-all duration-300">
            <div class="mb-4">
                <i class="fas fa-exclamation-triangle text-yellow-500 text-4xl"></i>
            </div>
            <h3 class="text-xl font-bold text-gray-800 mb-2">Confirmación Requerida</h3>
            <p class="mb-6 text-sm sm:text-base text-gray-600 break-words">${escapeHtml(message)}</p>
            <div class="flex flex-col-reverse sm:flex-row justify-center gap-3">
                <button id="confirm-cancel" class="w-full sm:w-auto px-6 py-2.5 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition font-semibold min-h-[44px]">Cancelar</button>
                <button id="confirm-ok" class="w-full sm:w-auto px-6 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition font-semibold min-h-[44px]">Eliminar</button>
            </div>
        </div>
    `;

    modal.querySelector('#confirm-ok').onclick = () => {
        onConfirm();
        modal.remove();
    };
    modal.querySelector('#confirm-cancel').onclick = () => modal.remove();

    document.body.appendChild(modal);
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.remove();
}

export async function generatePDF(processedData, reportData) {
    if (!processedData || Object.keys(processedData).length === 0) {
        showModal("No hay datos de estudiantes para generar el informe.", "error");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });
    const pageContentMargin = 14;
    const pageContentWidth = doc.internal.pageSize.getWidth() - (pageContentMargin * 2);

    // --- COVER PAGE ---
    doc.setFillColor(79, 70, 229); // Indigo
    doc.rect(0, 0, 210, 60, 'F');

    doc.setFontSize(24);
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.text("Informe Confidencial de Salud Escolar", 105, 35, { align: 'center' });

    doc.setFontSize(28);
    doc.setTextColor(55, 65, 81); // Dark Gray
    doc.setFont(undefined, 'bold');
    doc.text("Colegio Madre Matilde", 105, 100, { align: 'center' });

    const introText = "Este documento contiene información médica sensible y confidencial sobre los alumnos del centro. Su propósito es facilitar al personal docente y administrativo el conocimiento de las necesidades específicas de salud para garantizar un entorno seguro y una respuesta adecuada ante cualquier incidencia. Se ruega la máxima discreción y un manejo responsable de esta información.";
    doc.setFontSize(11);
    doc.setTextColor(107, 114, 128); // Medium Gray
    doc.setFont(undefined, 'normal');
    const splitIntro = doc.splitTextToSize(introText, 160);
    doc.text(splitIntro, 105, 130, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(55, 65, 81); // Dark Gray
    doc.text(`Fecha de Generación: ${new Date().toLocaleDateString('es-ES')}`, 105, 180, { align: 'center' });

    doc.setDrawColor(229, 231, 235); // Light gray border
    doc.rect(10, 10, 190, 277); // Page border


    // --- CONTENT PAGES ---
    const stages = ["Infantil", "Primaria", "ESO"];

    stages.forEach(stage => {
        const coursesData = processedData[stage];
        if (!coursesData) return;

        const courses = Object.keys(coursesData).sort();

        courses.forEach(course => {
            doc.addPage();
            let yPosition = 20;

            // Course Title
            doc.setFontSize(18);
            doc.setTextColor(45, 55, 72);
            doc.text(`${stage} - ${course}`, pageContentMargin, yPosition);
            yPosition += 15;

            // Report section
            const report = reportData[stage]?.[course];
            if (report) {
                doc.setFontSize(12);
                doc.setTextColor(29, 78, 216);
                doc.text("Análisis y Recomendaciones", pageContentMargin, yPosition);
                yPosition += 8;

                doc.setFontSize(10);
                doc.setTextColor(55, 65, 81);

                doc.setFont(undefined, 'bold');
                doc.text("Análisis:", pageContentMargin, yPosition);
                yPosition += 6;
                doc.setFont(undefined, 'normal');
                let analysisLines = doc.splitTextToSize(report.analysis, pageContentWidth);
                doc.text(analysisLines, pageContentMargin, yPosition);
                yPosition += analysisLines.length * 5 + 5;

                doc.setFont(undefined, 'bold');
                doc.text("Recomendaciones:", pageContentMargin, yPosition);
                yPosition += 6;
                doc.setFont(undefined, 'normal');
                const recommendationsText = report.recommendations.map(r => `- ${r}`).join('\n');
                let recLines = doc.splitTextToSize(recommendationsText, pageContentWidth);
                doc.text(recLines, pageContentMargin, yPosition);
                yPosition += recLines.length * 5 + 10;
            }

            // Student Table
            const students = [...processedData[stage][course]];
            const getSeverityScore = (s) => (s.severity === 'high' ? 1 : s.severity === 'medium' ? 2 : 3);
            students.sort((a, b) => getSeverityScore(a) - getSeverityScore(b));

            const tableHead = [['Nombre', 'Información de Salud', 'Riesgo']];
            const tableBody = students.map(student => {
                let severityText = '';
                switch (student.severity) {
                    case 'high': severityText = 'Alto'; break;
                    case 'medium': severityText = 'Atención'; break;
                    case 'low': severityText = 'Bajo'; break;
                    default: severityText = 'N/A';
                }
                return [student.name, student.info, severityText];
            });

            doc.autoTable({
                head: tableHead,
                body: tableBody,
                startY: yPosition,
                margin: { left: pageContentMargin, right: pageContentMargin },
                headStyles: { fillColor: [79, 70, 229] }, // Indigo
                styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
                columnStyles: {
                    0: { cellWidth: 35 },
                    1: { cellWidth: 110 },
                    2: { cellWidth: 20, halign: 'center' },
                },
                alternateRowStyles: { fillColor: [245, 245, 245] },
                didParseCell: function (data) {
                    if (data.column.index === 2 && data.cell.section === 'body') {
                        const text = data.cell.text[0];
                        if (text === 'Alto') {
                            data.cell.styles.fillColor = '#fecaca'; // Light Red
                            data.cell.styles.textColor = '#991b1b'; // Dark Red text
                            data.cell.styles.fontStyle = 'bold';
                        }
                        if (text === 'Atención') {
                            data.cell.styles.fillColor = '#fed7aa'; // Light Orange
                            data.cell.styles.textColor = '#9a3412'; // Dark Orange text
                        }
                        if (text === 'Bajo') {
                            data.cell.styles.fillColor = '#dcfce7'; // Light Green
                            data.cell.styles.textColor = '#166534'; // Dark Green text
                        }
                    }
                },
                didDrawPage: function (data) {
                    // Footer
                    doc.setFontSize(9);
                    doc.setTextColor(150);
                    doc.text(
                        'Informe de Salud Escolar - Página ' + doc.internal.getNumberOfPages(),
                        doc.internal.pageSize.getWidth() / 2,
                        doc.internal.pageSize.getHeight() - 10,
                        { align: 'center' }
                    );
                }
            });
        });
    });

    doc.save('informe-salud-escolar.pdf');
}
