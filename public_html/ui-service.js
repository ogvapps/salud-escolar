import { updateDoc, addDoc, deleteDoc, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showModal, showConfirmationModal, closeModal, generatePDF } from "./utils.js?v=2.4";
import { generateReportData } from "./report-service.js?v=2.4";
import { loginWithGoogle, logout, logAction } from "./firebase-service.js?v=2.4";

export class UIManager {
    constructor(db, studentsCollectionRef, auth) {
        this.db = db;
        this.studentsCollectionRef = studentsCollectionRef;
        this.auth = auth;
        this.isAdminMode = false;
        this.reportData = {};
        this.selectedFile = null;
        this.allStudents = [];
        this.processedData = {};

        // Lista de emails autorizados para el modo Admin
        this.adminWhitelist = [
            'ogonzalezv01@educarex.es', // Email del responsable principal
            // Añadir aquí más emails autorizados
        ];

        this.cacheDOMElements();
        this.registerEventListeners();
        this.initInactivityTimer();
    }

    initInactivityTimer() {
        const timeout = 5 * 60 * 1000; // 5 minutos
        let timer;

        const resetTimer = () => {
            clearTimeout(timer);
            timer = setTimeout(() => this.handleLogout('Sesión cerrada por inactividad'), timeout);
        };

        ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(name => {
            document.addEventListener(name, resetTimer, true);
        });
        resetTimer();
    }

    cacheDOMElements() {
        this.pinSection = document.getElementById('pin-section');
        this.googleSection = document.getElementById('google-section');
        this.initialPinForm = document.getElementById('initial-pin-form');
        this.googleLoginBtn = document.getElementById('google-login-btn');
        this.logoutBtn = document.getElementById('logout-btn');
        this.mainTabs = document.querySelectorAll('[data-tab="main-tabs"]');
        this.tabContents = document.querySelectorAll('.tab-content');
        this.studentListContainer = document.getElementById('student-list-container');
        this.addStudentForm = document.getElementById('add-student-form');
        this.adminToggleButton = document.getElementById('admin-toggle-btn');
        this.pdfDownloadButton = document.getElementById('pdf-download-btn');
        this.studentStageSelect = document.getElementById('student-stage');
        this.studentCourseSelect = document.getElementById('student-course');
        this.newCourseContainer = document.getElementById('new-course-container');
        this.newCourseNameInput = document.getElementById('new-course-name');

        this.dropZone = document.getElementById('drop-zone');
        this.fileInput = document.getElementById('file-input');
        this.browseBtn = document.getElementById('browse-btn');
        this.importBtn = document.getElementById('import-btn');
        this.fileNameDisplay = document.getElementById('file-name');
        this.importResults = document.getElementById('import-results');
    }

    registerEventListeners() {
        if (this.initialPinForm) {
            this.initialPinForm.addEventListener('submit', (e) => this.handleInitialPinSubmit(e));
        }
        if (this.googleLoginBtn) {
            this.googleLoginBtn.addEventListener('click', () => this.handleGoogleLogin());
        }
        if (this.logoutBtn) {
            this.logoutBtn.addEventListener('click', () => this.handleLogout());
        }
        this.mainTabs.forEach(tab => {
            tab.addEventListener('click', (e) => this.handleMainTabClick(e));
        });

        if (this.addStudentForm) {
            this.addStudentForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }
        this.adminToggleButton.addEventListener('click', () => this.toggleAdminMode());
        this.pdfDownloadButton.addEventListener('click', () => generatePDF(this.processedData, this.reportData));

        if (this.studentStageSelect) {
            this.studentStageSelect.addEventListener('change', () => this.populateCourseDropdown());
        }
        if (this.studentCourseSelect) {
            this.studentCourseSelect.addEventListener('change', () => this.toggleNewCourseInput());
        }

        if (this.browseBtn) {
            this.browseBtn.addEventListener('click', () => this.fileInput.click());
        }
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));
        }
        if (this.dropZone) {
            const preventDefaults = (e) => { e.preventDefault(); e.stopPropagation(); };
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                this.dropZone.addEventListener(eventName, preventDefaults, false);
            });
            ['dragenter', 'dragover'].forEach(eventName => {
                this.dropZone.addEventListener(eventName, () => this.dropZone.classList.add('drag-over'), false);
            });
            ['dragleave', 'drop'].forEach(eventName => {
                this.dropZone.addEventListener(eventName, () => this.dropZone.classList.remove('drag-over'), false);
            });
            this.dropZone.addEventListener('drop', (e) => this.handleFileSelect(e.dataTransfer.files), false);
        }
        if (this.importBtn) {
            this.importBtn.addEventListener('click', () => this.handleImport());
        }
    }

    handleInitialPinSubmit(e) {
        e.preventDefault();
        const pin = document.getElementById('initial-pin-input').value;
        if (pin === '1234') {
            this.pinSection.classList.add('hidden');
            this.googleSection.classList.remove('hidden');
        } else {
            showModal('PIN incorrecto.', 'error');
        }
    }

    async handleGoogleLogin() {
        try {
            document.getElementById('loading-overlay').classList.remove('hidden');
            await loginWithGoogle();
        } catch (error) {
            document.getElementById('loading-overlay').classList.add('hidden');
            showModal('Error: ' + error.message, 'error');
        }
    }

    async handleLogout(msg = null) {
        try {
            if (msg) alert(msg);
            await logout();
            location.reload();
        } catch (error) {
            showModal('Error al salir.', 'error');
        }
    }

    setStudents(students) {
        this.allStudents = students;
        this.processAndRenderData();
    }

    processAndRenderData() {
        this.processedData = this.allStudents.reduce((acc, student) => {
            const { stage, course } = student;
            if (!acc[stage]) acc[stage] = {};
            if (!acc[stage][course]) acc[stage][course] = [];
            acc[stage][course].push(student);
            return acc;
        }, {});

        this.reportData = generateReportData(this.allStudents);
        this.renderCourseButtons();
        this.populateCourseDropdown();

        const activeCourseBtn = document.querySelector('.course-btn-active');
        if (activeCourseBtn) {
            const { stage, course } = activeCourseBtn.dataset;
            this.renderStudentList(stage, course);
        } else {
            const activeTab = document.querySelector('.tab-active');
            if (activeTab && !['add-student', 'import-data'].includes(activeTab.dataset.target)) {
                const firstCourse = document.querySelector(`#${activeTab.dataset.target} .course-btn`);
                if (firstCourse) firstCourse.click();
            } else if (!activeTab) {
                const firstTab = this.mainTabs[0];
                if (firstTab) firstTab.click();
            }
        }
    }

    renderCourseButtons() {
        for (const stage of ["Infantil", "Primaria", "ESO"]) {
            const containerId = `courses-${stage.toLowerCase()}`;
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '';
                const coursesData = this.processedData[stage] || {};
                const courses = Object.keys(coursesData).sort();

                courses.forEach(course => {
                    const studentCount = coursesData[course].length;
                    const button = document.createElement('button');
                    button.className = 'course-btn px-5 py-2 rounded-md font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 flex items-center justify-between w-52';
                    button.dataset.stage = stage;
                    button.dataset.course = course;
                    button.innerHTML = `
                        <span>${course}</span>
                        <span class="ml-2 bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-1 rounded-full">
                            ${studentCount}
                        </span>
                    `;
                    button.addEventListener('click', (e) => this.handleCourseClick(e));
                    container.appendChild(button);
                });
            }
        }
    }

    handleCourseClick(e) {
        const button = e.currentTarget;
        const { stage, course } = button.dataset;
        this.renderStudentList(stage, course);
        document.querySelectorAll('.course-btn').forEach(btn => btn.classList.remove('course-btn-active'));
        button.classList.add('course-btn-active');
    }

    renderStudentList(stage, course) {
        const students = this.processedData?.[stage]?.[course];
        const report = this.reportData[stage]?.[course];

        if (!students) {
            this.studentListContainer.innerHTML = '<p class="text-gray-500 text-center p-6">No se encontraron estudiantes.</p>';
            return;
        }

        let reportHtml = '';
        if (report) {
            reportHtml = `
                <div class="bg-blue-50 border-l-4 border-blue-500 text-blue-800 p-6 rounded-lg mb-8 shadow-md">
                    <h4 class="text-xl font-bold mb-3 flex items-center"><i class="fas fa-chart-bar mr-3"></i>Recomendaciones del Curso</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                        <div>
                            <h5 class="font-semibold mb-2 text-gray-700">Análisis:</h5>
                            <p class="text-sm text-gray-600">${report.analysis}</p>
                            <h5 class="font-semibold mt-4 mb-2 text-gray-700">Riesgos:</h5>
                            <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                                <span class="flex items-center"><div class="w-3 h-3 rounded-full bg-red-500 mr-2"></div>Alto: ${report.summary.high}</span>
                                <span class="flex items-center"><div class="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>Medio: ${report.summary.medium}</span>
                            </div>
                        </div>
                        <div>
                            <h5 class="font-semibold mb-2 text-gray-700">Protocolos:</h5>
                            <ul class="list-disc list-inside text-sm text-gray-600">
                                ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                </div>
            `;
        }

        const getWeight = (s) => (s.severity === 'high' ? 1 : s.severity === 'medium' ? 2 : 3);
        students.sort((a, b) => getWeight(a) - getWeight(b));

        this.studentListContainer.innerHTML = `<h3 class="text-2xl font-bold text-gray-800 mb-5">${course}</h3>`;
        this.studentListContainer.innerHTML += reportHtml;
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';

        students.forEach(student => grid.appendChild(this.createStudentCard(student)));
        this.studentListContainer.appendChild(grid);
    }

    createStudentCard(student) {
        let borderColor = 'border-gray-200';
        let cardBgColor = 'bg-white';
        let alertsHtml = '';

        switch (student.severity) {
            case 'low': alertsHtml = `<span class="alert-mini-card alert-mini-card-green">Bajo</span>`; break;
            case 'high': borderColor = 'border-red-500'; alertsHtml = `<span class="alert-mini-card alert-mini-card-red">Crítico</span>`; break;
            case 'medium': borderColor = 'border-yellow-500'; alertsHtml = `<span class="alert-mini-card alert-mini-card-yellow">Atención</span>`; break;
        }

        const card = document.createElement('div');
        card.className = `student-card p-5 ${borderColor} ${cardBgColor}`;

        let adminButtonsHtml = '';
        if (this.isAdminMode) {
            adminButtonsHtml = `
                <div class="mt-4 pt-4 border-t flex justify-end gap-2">
                    <button class="edit-btn px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">Editar</button>
                    <button class="delete-btn px-3 py-2 bg-red-600 text-white rounded-lg text-sm">Borrar</button>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="cursor-pointer detail-trigger group">
                <h4 class="font-bold text-xl group-hover:text-indigo-600 transition-colors">${student.name}</h4>
                <p class="text-gray-500 text-sm mb-2">${student.course}</p>
                <div class="mb-3">${alertsHtml}</div>
                <div class="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-3 text-center group-hover:bg-indigo-50 group-hover:border-indigo-300 transition-all">
                    <p class="text-xs font-bold text-gray-400 group-hover:text-indigo-500 uppercase tracking-widest">
                        <i class="fas fa-eye-slash mr-2"></i>Información Protegida
                    </p>
                    <p class="text-sm text-gray-500 mt-1">Haz clic para ver detalles médicos</p>
                </div>
            </div>
            ${adminButtonsHtml}
        `;

        card.querySelector('.detail-trigger').addEventListener('click', () => this.showStudentDetailModal(student));
        if (this.isAdminMode) {
            card.querySelector('.edit-btn').addEventListener('click', () => this.showEditStudentModal(student));
            card.querySelector('.delete-btn').addEventListener('click', () => this.confirmDeleteStudent(student.id, student.name));
        }
        return card;
    }

    showStudentDetailModal(student) {
        const modalHtml = `
            <div id="detail-modal-backdrop" class="fixed inset-0 flex items-center justify-center z-50 p-4">
                <div class="modal-content-container w-full max-w-4xl max-h-[90vh] overflow-y-auto p-8 relative">
                    <button class="absolute top-5 right-5 text-3xl close-detail"><i class="fas fa-times-circle text-gray-400"></i></button>
                    <h3 class="text-3xl font-bold mb-6">${student.name}</h3>
                    <div class="info-section p-6 bg-white rounded-xl shadow-sm">
                        <p class="text-gray-700 whitespace-pre-line">${student.info}</p>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.querySelector('.close-detail').onclick = () => closeModal('detail-modal-backdrop');
    }

    showEditStudentModal(student) {
        const modalId = 'edit-student-modal';
        closeModal(modalId);

        const modalHtml = `
            <div id="${modalId}" class="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
                <div class="bg-white p-8 rounded-xl shadow-2xl w-full max-w-2xl">
                    <h3 class="text-2xl font-bold mb-6">Editando: ${student.name}</h3>
                    <form id="edit-student-form" class="space-y-4">
                        <input type="hidden" id="edit-student-id" value="${student.id}">
                        <input type="text" id="edit-student-name" class="block w-full px-4 py-2 border rounded-lg" value="${student.name}" required>
                        <textarea id="edit-student-info" rows="6" class="block w-full px-4 py-2 border rounded-lg" required>${student.info}</textarea>
                        <div class="flex gap-4">
                            <label><input type="radio" name="edit-severity" value="high" ${student.severity === 'high' ? 'checked' : ''}> Alto</label>
                            <label><input type="radio" name="edit-severity" value="medium" ${student.severity === 'medium' ? 'checked' : ''}> Medio</label>
                            <label><input type="radio" name="edit-severity" value="low" ${student.severity === 'low' ? 'checked' : ''}> Bajo</label>
                        </div>
                        <div class="flex justify-end gap-4 pt-4">
                            <button type="button" class="cancel-edit bg-gray-200 px-6 py-2 rounded-lg">Cancelar</button>
                            <button type="submit" class="bg-indigo-600 text-white px-6 py-2 rounded-lg">Guardar</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.getElementById('edit-student-form').addEventListener('submit', (e) => this.handleEditSubmit(e));
        document.querySelector('.cancel-edit').onclick = () => closeModal(modalId);
    }

    async handleEditSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('edit-student-id').value;
        const newData = {
            name: document.getElementById('edit-student-name').value,
            info: document.getElementById('edit-student-info').value,
            severity: document.querySelector('input[name="edit-severity"]:checked')?.value
        };

        try {
            await updateDoc(doc(this.db, this.studentsCollectionRef.path, id), newData);
            await logAction('UPDATE_STUDENT', { id, after: newData });
            closeModal('edit-student-modal');
            showModal('Actualizado correctamente.', 'success');
        } catch (error) {
            showModal('Error al actualizar.', 'error');
        }
    }

    confirmDeleteStudent(id, name) {
        showConfirmationModal(`¿Eliminar a ${name}?`, () => this.deleteStudent(id, name));
    }

    async deleteStudent(id, name) {
        try {
            await deleteDoc(doc(this.db, this.studentsCollectionRef.path, id));
            await logAction('DELETE_STUDENT', { id, name });
            showModal('Eliminado correctamente.', 'success');
        } catch (error) {
            showModal('No se pudo eliminar.', 'error');
        }
    }

    async toggleAdminMode() {
        if (this.isAdminMode) {
            this.setAdminMode(false);
            return;
        }

        const currentUser = this.auth.currentUser;
        if (!currentUser) {
            showModal('Debes estar identificado.', 'error');
            return;
        }

        if (this.adminWhitelist.includes(currentUser.email)) {
            const { value: adminPin } = await Swal.fire({
                title: '🔐 Acceso Administrativo',
                html: '<p style="color: #64748b; margin-bottom: 1.5rem;">Introduce tu PIN de administrador</p>',
                input: 'password',
                inputPlaceholder: '••••',
                inputAttributes: {
                    maxlength: 4,
                    autocapitalize: 'off',
                    autocorrect: 'off'
                },
                showCancelButton: true,
                confirmButtonText: 'Verificar',
                cancelButtonText: 'Cancelar',
                customClass: {
                    popup: 'swal2-popup',
                    title: 'swal2-title',
                    htmlContainer: 'swal2-html-container',
                    input: 'swal2-input',
                    confirmButton: 'swal2-confirm',
                    cancelButton: 'swal2-cancel'
                },
                buttonsStyling: false,
                allowOutsideClick: false,
                inputValidator: (value) => {
                    if (!value) {
                        return 'Por favor, introduce el PIN';
                    }
                }
            });

            if (adminPin === '2026') {
                this.setAdminMode(true);
                logAction('ADMIN_LOGIN_SUCCESS', { email: currentUser.email });
                Swal.fire({
                    icon: 'success',
                    title: '¡Acceso Concedido!',
                    text: 'Modo administrador activado',
                    timer: 2000,
                    showConfirmButton: false,
                    customClass: {
                        popup: 'swal2-popup'
                    }
                });
            } else if (adminPin) {
                showModal('PIN de administrador incorrecto.', 'error');
                logAction('ADMIN_LOGIN_FAILURE', { email: currentUser.email, reason: 'Wrong PIN' });
            }
        } else {
            showModal('Acceso denegado. Tu cuenta no tiene permisos de administrador.', 'error');
            logAction('ADMIN_LOGIN_FAILURE', { email: currentUser.email });
        }
    }

    setAdminMode(isActive) {
        this.isAdminMode = isActive;
        if (isActive) {
            this.adminToggleButton.innerHTML = `<i class="fas fa-lock-open mr-2"></i>Admin Activo`;
            this.adminToggleButton.classList.replace('bg-amber-400', 'bg-green-500');
            ['pdf-download-btn', 'add-student-btn', 'import-data-btn'].forEach(id => document.getElementById(id)?.classList.remove('hidden'));
        } else {
            this.adminToggleButton.innerHTML = `<i class="fas fa-user-shield mr-2"></i>Modo Admin`;
            this.adminToggleButton.classList.replace('bg-green-500', 'bg-amber-400');
            ['pdf-download-btn', 'add-student-btn', 'import-data-btn'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
        }
        this.processAndRenderData();
    }

    handleMainTabClick(e) {
        const targetId = e.currentTarget.dataset.target;
        this.mainTabs.forEach(t => t.classList.remove('tab-active', 'bg-indigo-600', 'text-white'));
        e.currentTarget.classList.add('tab-active', 'bg-indigo-600', 'text-white');
        this.tabContents.forEach(content => content.classList.add('hidden'));
        document.getElementById(targetId)?.classList.remove('hidden');

        if (!['add-student', 'import-data'].includes(targetId)) {
            setTimeout(() => {
                const firstCourse = document.getElementById(targetId).querySelector('.course-btn');
                if (firstCourse) firstCourse.click();
            }, 50);
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        const student = {
            name: document.getElementById('student-name').value,
            stage: this.studentStageSelect.value,
            course: this.studentCourseSelect.value === 'new' ? this.newCourseNameInput.value.trim() : this.studentCourseSelect.value,
            info: document.getElementById('student-info').value,
            severity: document.querySelector('input[name="severity"]:checked')?.value,
            createdAt: serverTimestamp()
        };

        try {
            await addDoc(this.studentsCollectionRef, student);
            await logAction('CREATE_STUDENT', { name: student.name, course: student.course });
            this.addStudentForm.reset();
            this.populateCourseDropdown();
            showModal('Añadido con éxito.', 'success');
        } catch (error) {
            showModal('Error al añadir.', 'error');
        }
    }

    populateCourseDropdown() {
        if (!this.studentStageSelect) return;
        const stage = this.studentStageSelect.value;
        const courses = Object.keys(this.processedData[stage] || {}).sort();
        this.studentCourseSelect.innerHTML = courses.map(c => `<option value="${c}">${c}</option>`).join('') + '<option value="new">Otro...</option>';
        this.toggleNewCourseInput();
    }

    toggleNewCourseInput() {
        if (this.studentCourseSelect && this.newCourseContainer) {
            this.newCourseContainer.classList.toggle('hidden', this.studentCourseSelect.value !== 'new');
        }
    }

    handleFileSelect(files) {
        if (!files.length) return;
        this.selectedFile = files[0];
        this.fileNameDisplay.textContent = `Archivo: ${files[0].name}`;
        this.importBtn.disabled = false;
    }

    async handleImport() {
        if (!this.selectedFile) return;
        this.importBtn.disabled = true;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            await this.processImportedData(json);
        };
        reader.readAsArrayBuffer(this.selectedFile);
    }

    async processImportedData(data) {
        const batch = writeBatch(this.db);
        data.forEach(row => {
            const student = {
                name: row['Nombre del Alumno/a'],
                stage: row['Grupo']?.includes('infantil') ? 'Infantil' : (row['Grupo']?.includes('primaria') ? 'Primaria' : 'ESO'),
                course: row['Grupo']?.replace('_', 'º '),
                severity: row['Estado']?.toLowerCase() === 'rojo' ? 'high' : (row['Estado']?.toLowerCase() === 'amarillo' ? 'medium' : 'low'),
                info: row['Observaciones'] || 'Sin datos',
                createdAt: serverTimestamp()
            };
            batch.set(doc(this.studentsCollectionRef), student);
        });
        try {
            await batch.commit();
            await logAction('BULK_IMPORT', { count: data.length });
            showModal('Importación terminada.', 'success');
        } catch (error) {
            showModal('Error al importar.', 'error');
        }
    }
}
