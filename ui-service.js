import { updateDoc, addDoc, deleteDoc, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showModal, showConfirmationModal, closeModal, generatePDF } from "./utils.js";
import { generateReportData } from "./report-service.js";
import { loginWithGoogle, logout, logAction, deleteAllStudents, promoteAllStudents, applyDiffSync } from "./firebase-service.js";
import { calculateStudentsDiff, getPromotedCourse } from "./diff-service.js";

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
        this.currentDiffResult = null;

        // Lista de emails autorizados para el modo Admin
        this.adminWhitelist = [
            'ogonzalezv01@educarex.es', // Email del responsable principal
            'orestesgv@gmail.com'        // Administrador técnico
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
        this.promoteCoursesBtn = document.getElementById('promote-courses-btn');
        this.clearAllStudentsBtn = document.getElementById('clear-all-students-btn');
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
        this.directAccessBtn = document.getElementById('direct-access-btn');
    }

    registerEventListeners() {
        if (this.initialPinForm) {
            this.initialPinForm.addEventListener('submit', (e) => this.handleInitialPinSubmit(e));
        }
        if (this.directAccessBtn) {
            this.directAccessBtn.addEventListener('click', () => {
                if (typeof window.unlockWithPin === 'function') {
                    window.unlockWithPin();
                }
            });
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
        if (this.promoteCoursesBtn) {
            this.promoteCoursesBtn.addEventListener('click', () => this.handlePromoteCourses());
        }
        if (this.clearAllStudentsBtn) {
            this.clearAllStudentsBtn.addEventListener('click', () => this.handleClearAllStudents());
        }

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
            console.error("Google login failed:", error);

            let errorTitle = 'No se pudo iniciar sesión con Google';
            let errorHtml = '';

            if (error.code === 'auth/unauthorized-domain') {
                errorHtml = `
                    <div class="text-left text-slate-700 text-sm space-y-3">
                        <p class="font-bold text-red-600">Dominio web no autorizado en Firebase</p>
                        <p>El dominio actual (<code>${window.location.hostname}</code>) aún no ha sido autorizado en Firebase Console.</p>
                        <div class="bg-indigo-50 p-3.5 rounded-xl border border-indigo-100 text-xs text-indigo-900 space-y-1">
                            <p class="font-bold"><i class="fas fa-check-circle text-indigo-600 mr-1"></i> Puedes entrar ya mismo:</p>
                            <p>Haz clic en el botón azul <strong>"Acceder con PIN de Centro"</strong> para entrar con el PIN del colegio (1234) sin depender de Google.</p>
                        </div>
                        <p class="text-[11px] text-slate-400">Para habilitar Google aquí: añade <strong>${window.location.hostname}</strong> en Firebase Console > Authentication > Settings > Authorized domains.</p>
                    </div>
                `;
            } else if (error.code === 'auth/popup-blocked') {
                errorHtml = `
                    <div class="text-left text-slate-700 text-sm space-y-2">
                        <p class="font-bold text-amber-600">Ventana emergente bloqueada</p>
                        <p>Tu navegador ha bloqueado la ventana emergente de Google. Puedes habilitarla o usar el botón <strong>"Acceder con PIN de Centro"</strong>.</p>
                    </div>
                `;
            } else if (error.code === 'auth/popup-closed-by-user') {
                errorHtml = `
                    <div class="text-left text-slate-700 text-sm">
                        <p>Se cerró la ventana de Google antes de finalizar la identificación.</p>
                    </div>
                `;
            } else {
                errorHtml = `
                    <div class="text-left text-slate-700 text-sm space-y-2">
                        <p>${error.message}</p>
                        <p class="text-xs text-indigo-700">Recuerda que puedes pulsar <strong>"Acceder con PIN de Centro"</strong> para acceder directamente con el PIN.</p>
                    </div>
                `;
            }

            Swal.fire({
                icon: 'warning',
                title: errorTitle,
                html: errorHtml,
                confirmButtonText: 'Entendido',
                customClass: { popup: 'swal2-popup' }
            });
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
        const userEmail = currentUser && currentUser.email ? currentUser.email.toLowerCase() : null;
        const isWhitelisted = userEmail && this.adminWhitelist.map(e => e.toLowerCase()).includes(userEmail);
        const isCenterAccess = !currentUser || currentUser.isAnonymous || !currentUser.email;

        if (isWhitelisted || isCenterAccess) {
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
            ['pdf-download-btn', 'promote-courses-btn', 'clear-all-students-btn', 'add-student-btn', 'import-data-btn'].forEach(id => document.getElementById(id)?.classList.remove('hidden'));
        } else {
            this.adminToggleButton.innerHTML = `<i class="fas fa-user-shield mr-2"></i>Modo Admin`;
            this.adminToggleButton.classList.replace('bg-green-500', 'bg-amber-400');
            ['pdf-download-btn', 'promote-courses-btn', 'clear-all-students-btn', 'add-student-btn', 'import-data-btn'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
        }
        this.processAndRenderData();
    }

    async handlePromoteCourses() {
        if (!this.isAdminMode) {
            showModal('Función exclusiva para administradores.', 'error');
            return;
        }

        const total = this.allStudents.length;
        if (total === 0) {
            Swal.fire({
                icon: 'info',
                title: 'No hay alumnos',
                text: 'No hay alumnos registrados actualmente para promocionar.',
                customClass: { popup: 'swal2-popup' }
            });
            return;
        }

        let willAdvance = 0;
        let willChangeStage = 0;
        let willGraduate = 0;

        this.allStudents.forEach(st => {
            const next = getPromotedCourse(st.stage, st.course);
            if (next.isGraduate) {
                willGraduate++;
            } else {
                willAdvance++;
                if (next.stage !== st.stage) {
                    willChangeStage++;
                }
            }
        });

        const result = await Swal.fire({
            title: '🚀 Promocionar Cursos Escolares',
            html: `
                <div class="text-left space-y-4 text-slate-700 text-sm">
                    <p>Esta acción avanzará a <strong>todo el alumnado al siguiente nivel educativo</strong> para iniciar el nuevo año escolar:</p>
                    
                    <div class="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-2 text-indigo-950 font-medium">
                        <div class="flex justify-between">
                            <span>📈 Alumnos que avanzan de curso:</span>
                            <strong class="text-indigo-600 font-bold">${willAdvance}</strong>
                        </div>
                        <div class="flex justify-between">
                            <span>🔄 Cambio de etapa (Infantil ➔ Primaria / Primaria ➔ ESO):</span>
                            <strong class="text-indigo-600 font-bold">${willChangeStage}</strong>
                        </div>
                        <div class="flex justify-between">
                            <span>🎓 Alumnos de 4º ESO (Fin de etapa escolar):</span>
                            <strong class="text-rose-600 font-bold">${willGraduate}</strong>
                        </div>
                    </div>

                    <div class="bg-amber-50 border-l-4 border-amber-500 p-3 rounded text-xs text-amber-900 leading-relaxed">
                        <i class="fas fa-exclamation-triangle mr-1 text-amber-600"></i>
                        Los alumnos que completan 4º de la ESO saldrán de las listas activas. Asegúrate de tener el <strong>Resumen PDF</strong> descargado si necesitas archivar sus historiales médicos.
                    </div>

                    <div class="pt-2">
                        <label class="flex items-center gap-3 cursor-pointer text-xs font-semibold text-slate-600">
                            <input type="checkbox" id="delete-graduates-chk" checked class="w-4 h-4 text-indigo-600 rounded">
                            <span>Eliminar alumnos egresados de 4º ESO de las listas activas</span>
                        </label>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check-circle mr-2"></i>Confirmar Promoción',
            cancelButtonText: 'Cancelar',
            customClass: {
                popup: 'swal2-popup',
                confirmButton: 'swal2-confirm bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg',
                cancelButton: 'swal2-cancel bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-xl'
            },
            buttonsStyling: false,
            showLoaderOnConfirm: true,
            allowOutsideClick: () => !Swal.isLoading(),
            preConfirm: async () => {
                try {
                    const deleteGraduates = document.getElementById('delete-graduates-chk')?.checked !== false;
                    const res = await promoteAllStudents(this.studentsCollectionRef, { deleteGraduates });
                    return res;
                } catch (error) {
                    Swal.showValidationMessage(`Error al promocionar: ${error.message}`);
                }
            }
        });

        if (result.isConfirmed) {
            const data = result.value;
            Swal.fire({
                icon: 'success',
                title: '¡Cursos Promocionados!',
                html: `
                    <div class="text-slate-700 text-sm space-y-2">
                        <p>Se han actualizado correctamente los cursos de los alumnos.</p>
                        <p class="text-indigo-600 font-bold">✓ ${data.promotedCount} alumnos han subido de curso.</p>
                        ${data.graduatedCount > 0 ? `<p class="text-slate-500 font-medium">✓ ${data.graduatedCount} alumnos de 4º ESO han finalizado su etapa escolar.</p>` : ''}
                    </div>
                `,
                confirmButtonText: 'Entendido',
                customClass: { popup: 'swal2-popup' }
            });
        }
    }

    async handleClearAllStudents() {
        if (!this.isAdminMode) {
            showModal('Función exclusiva para administradores.', 'error');
            return;
        }

        const count = this.allStudents.length;
        if (count === 0) {
            Swal.fire({
                icon: 'info',
                title: 'No hay alumnos',
                text: 'La base de datos ya está vacía. Puedes importar un archivo Excel para el nuevo curso escolar.',
                customClass: { popup: 'swal2-popup' }
            });
            return;
        }

        const result = await Swal.fire({
            title: '⚠️ ¿Nuevo Curso Escolar?',
            html: `
                <div class="text-left space-y-3 text-slate-700 text-sm">
                    <p class="font-bold text-red-600 text-base">
                        ¡Atención! Esta acción borrará de forma definitiva a los <strong>${count}</strong> alumnos registrados actualmente.
                    </p>
                    <p>
                        Usa esta opción únicamente para reiniciar la aplicación de cara a un nuevo curso escolar.
                    </p>
                    <p class="bg-amber-50 border-l-4 border-amber-500 p-3 text-amber-800 rounded-lg text-xs leading-relaxed">
                        <i class="fas fa-info-circle mr-1 text-amber-600"></i> Consejo: Asegúrate de haber descargado antes el <strong>Resumen PDF</strong> si necesitas conservar copia del curso anterior.
                    </p>
                    <p class="pt-2 font-semibold">
                        Para confirmar, escribe la palabra <span class="text-red-600 font-mono font-bold tracking-wider">BORRAR</span>:
                    </p>
                </div>
            `,
            input: 'text',
            inputPlaceholder: 'Escribe BORRAR para confirmar',
            inputAttributes: {
                autocapitalize: 'characters',
                autocomplete: 'off'
            },
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-trash-alt mr-2"></i>Sí, borrar todos los alumnos',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#64748b',
            customClass: {
                popup: 'swal2-popup',
                confirmButton: 'swal2-confirm bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg',
                cancelButton: 'swal2-cancel bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-xl'
            },
            buttonsStyling: false,
            allowOutsideClick: () => !Swal.isLoading(),
            inputValidator: (value) => {
                if (value !== 'BORRAR') {
                    return 'Debes escribir exactamente la palabra BORRAR en mayúsculas';
                }
            },
            showLoaderOnConfirm: true,
            preConfirm: async () => {
                try {
                    const deletedCount = await deleteAllStudents(this.studentsCollectionRef);
                    return deletedCount;
                } catch (error) {
                    Swal.showValidationMessage(`Error al eliminar: ${error.message}`);
                }
            }
        });

        if (result.isConfirmed) {
            Swal.fire({
                icon: 'success',
                title: '¡Curso Reiniciado!',
                html: `Se han eliminado los datos de <strong>${result.value}</strong> alumnos.<br><br>El sistema está preparado para importar el nuevo listado desde la pestaña <strong>"Importar"</strong>.`,
                confirmButtonText: 'Aceptar',
                customClass: { popup: 'swal2-popup' }
            });
        }
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
        this.fileNameDisplay.textContent = `Archivo seleccionado: ${files[0].name}`;
        this.fileNameDisplay.classList.remove('hidden');

        // Leer el archivo y calcular el análisis comparativo
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                
                this.currentDiffResult = calculateStudentsDiff(this.allStudents, json);
                this.renderDiffPreview(this.currentDiffResult);
            } catch (err) {
                console.error("Error al procesar archivo Excel:", err);
                showModal("Error al leer el archivo Excel. Asegúrate de que contiene las columnas habituales.", "error");
            }
        };
        reader.readAsArrayBuffer(this.selectedFile);
    }

    renderDiffPreview(diff) {
        if (!this.importResults) return;

        this.importResults.classList.remove('hidden');
        if (this.importBtn) this.importBtn.classList.add('hidden');

        const { newStudents, modifiedStudents, unchangedStudents, removedStudents, totalIncoming, totalCurrent } = diff;

        const severityBadge = (sev) => {
            if (sev === 'high') return `<span class="bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded text-xs">Alto</span>`;
            if (sev === 'medium') return `<span class="bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded text-xs">Medio</span>`;
            return `<span class="bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded text-xs">Leve</span>`;
        };

        let modifiedDetailsHtml = '';
        if (modifiedStudents.length > 0) {
            modifiedDetailsHtml = `
                <div class="mt-4 border border-amber-200 rounded-2xl bg-amber-50/60 p-5 space-y-3 text-xs">
                    <h5 class="font-bold text-amber-900 uppercase tracking-wider text-xs flex items-center justify-between">
                        <span><i class="fas fa-edit mr-2 text-amber-600"></i>Fichas con Cambios Médicos o de Curso (${modifiedStudents.length})</span>
                        <span class="text-[10px] font-normal text-amber-700">Revisa las modificaciones detectadas</span>
                    </h5>
                    <div class="max-h-72 overflow-y-auto space-y-3 pr-1">
                        ${modifiedStudents.map(m => `
                            <div class="bg-white p-3.5 rounded-xl shadow-sm border border-amber-100 space-y-2">
                                <div class="flex items-center justify-between font-bold text-slate-800 text-sm">
                                    <span>${m.name}</span>
                                    <span class="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                                        ${m.existing.course} ${m.existing.course !== m.incoming.course ? `➔ ${m.incoming.course}` : ''}
                                    </span>
                                </div>
                                <div class="space-y-1.5 text-slate-600">
                                    ${m.changes.severity ? `
                                        <div class="flex items-center gap-2">
                                            <span class="font-semibold text-slate-700">Nivel de Riesgo:</span>
                                            ${severityBadge(m.changes.severity.from)} ➔ ${severityBadge(m.changes.severity.to)}
                                        </div>
                                    ` : ''}
                                    ${m.changes.info ? `
                                        <div class="mt-1">
                                            <span class="font-semibold text-slate-700">Observaciones / Tratamiento modificado:</span>
                                            <div class="text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-100 mt-1 whitespace-pre-line text-slate-700 font-mono">
                                                ${m.incoming.info}
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        let newStudentsHtml = '';
        if (newStudents.length > 0) {
            newStudentsHtml = `
                <details class="mt-4 border border-emerald-200 rounded-2xl bg-emerald-50/40 p-4 text-xs">
                    <summary class="font-bold text-emerald-900 cursor-pointer uppercase tracking-wider text-xs flex items-center justify-between">
                        <span><i class="fas fa-user-plus mr-2 text-emerald-600"></i>Nuevas Altas detectadas (${newStudents.length})</span>
                        <span class="text-[10px] text-emerald-600 font-normal">Hacer clic para desplegar</span>
                    </summary>
                    <div class="mt-3 max-h-52 overflow-y-auto space-y-1.5 pt-2 pr-1">
                        ${newStudents.map(n => `
                            <div class="flex items-center justify-between bg-white p-2.5 rounded-xl border border-emerald-100 text-slate-700">
                                <div>
                                    <span class="font-bold text-slate-800">${n.name}</span>
                                    <span class="text-slate-400 text-[11px] ml-2 font-medium">(${n.course})</span>
                                </div>
                                <div>${severityBadge(n.severity)}</div>
                            </div>
                        `).join('')}
                    </div>
                </details>
            `;
        }

        let removedStudentsHtml = '';
        if (removedStudents.length > 0) {
            removedStudentsHtml = `
                <details class="mt-4 border border-rose-200 rounded-2xl bg-rose-50/40 p-4 text-xs">
                    <summary class="font-bold text-rose-900 cursor-pointer uppercase tracking-wider text-xs flex items-center justify-between">
                        <span><i class="fas fa-user-minus mr-2 text-rose-600"></i>Alumnos actuales no listados en el Excel (${removedStudents.length})</span>
                        <span class="text-[10px] text-rose-600 font-normal">Hacer clic para desplegar</span>
                    </summary>
                    <div class="mt-3 max-h-52 overflow-y-auto space-y-1.5 pt-2 pr-1">
                        ${removedStudents.map(r => `
                            <div class="flex items-center justify-between bg-white p-2.5 rounded-xl border border-rose-100 text-slate-700">
                                <span class="font-semibold text-slate-800">${r.name} (${r.course})</span>
                                <span class="text-rose-600 font-medium text-[11px] bg-rose-50 px-2 py-0.5 rounded border border-rose-100">No incluido</span>
                            </div>
                        `).join('')}
                    </div>
                </details>
            `;
        }

        this.importResults.innerHTML = `
            <div class="space-y-6 animate-fade-in">
                <div class="text-center">
                    <h4 class="text-2xl font-black text-slate-800">Resultado del Análisis Comparativo</h4>
                    <p class="text-xs text-slate-500 mt-1">
                        Alumnos en el archivo entrante: <strong>${totalIncoming}</strong> · Alumnos en la app: <strong>${totalCurrent}</strong>
                    </p>
                </div>

                <!-- 4 Tarjetas Métricas -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                        <div class="text-2xl font-black text-emerald-600">${newStudents.length}</div>
                        <div class="text-[11px] font-bold text-emerald-800 uppercase tracking-wider mt-1">Nuevas Altas</div>
                    </div>
                    <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                        <div class="text-2xl font-black text-amber-600">${modifiedStudents.length}</div>
                        <div class="text-[11px] font-bold text-amber-800 uppercase tracking-wider mt-1">Fichas Modificadas</div>
                    </div>
                    <div class="bg-slate-100 border border-slate-200 rounded-2xl p-4">
                        <div class="text-2xl font-black text-slate-600">${unchangedStudents.length}</div>
                        <div class="text-[11px] font-bold text-slate-700 uppercase tracking-wider mt-1">Sin Cambios</div>
                    </div>
                    <div class="bg-rose-50 border border-rose-200 rounded-2xl p-4">
                        <div class="text-2xl font-black text-rose-600">${removedStudents.length}</div>
                        <div class="text-[11px] font-bold text-rose-800 uppercase tracking-wider mt-1">No Presentes</div>
                    </div>
                </div>

                ${modifiedDetailsHtml}
                ${newStudentsHtml}
                ${removedStudentsHtml}

                <!-- Acciones a aplicar -->
                <div class="bg-slate-100/80 p-5 rounded-2xl space-y-2.5 text-xs text-slate-700 font-medium">
                    <div class="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2">Acciones a aplicar en Firestore:</div>
                    <label class="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" id="diff-opt-new" checked class="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500">
                        <span>Dar de alta a los <strong>${newStudents.length}</strong> alumnos nuevos</span>
                    </label>
                    <label class="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" id="diff-opt-mod" checked class="w-4 h-4 text-amber-600 rounded focus:ring-amber-500">
                        <span>Actualizar fichas médicas de los <strong>${modifiedStudents.length}</strong> alumnos con cambios</span>
                    </label>
                    ${removedStudents.length > 0 ? `
                        <label class="flex items-center gap-2.5 cursor-pointer text-rose-700">
                            <input type="checkbox" id="diff-opt-del" class="w-4 h-4 text-rose-600 rounded focus:ring-rose-500">
                            <span>Dar de baja / Eliminar a los <strong>${removedStudents.length}</strong> alumnos no presentes en este archivo</span>
                        </label>
                    ` : ''}
                </div>

                <div class="flex flex-col sm:flex-row justify-center gap-4 pt-3">
                    <button id="apply-diff-btn"
                        class="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-200 flex items-center justify-center gap-3 transition-all">
                        <i class="fas fa-check-double"></i>Confirmar y Aplicar Cambios
                    </button>
                    <button id="cancel-diff-btn"
                        class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-8 py-4 rounded-2xl font-bold text-sm transition-all">
                        Cancelar
                    </button>
                </div>
            </div>
        `;

        document.getElementById('apply-diff-btn')?.addEventListener('click', () => this.handleApplyDiff());
        document.getElementById('cancel-diff-btn')?.addEventListener('click', () => {
            this.importResults.classList.add('hidden');
            this.fileNameDisplay.classList.add('hidden');
            this.selectedFile = null;
            this.currentDiffResult = null;
            if (this.fileInput) this.fileInput.value = '';
            if (this.importBtn) this.importBtn.classList.remove('hidden');
            if (this.importBtn) this.importBtn.disabled = true;
        });
    }

    async handleApplyDiff() {
        if (!this.currentDiffResult) return;

        const importNew = document.getElementById('diff-opt-new')?.checked !== false;
        const updateModified = document.getElementById('diff-opt-mod')?.checked !== false;
        const deleteRemoved = document.getElementById('diff-opt-del')?.checked === true;

        if (!importNew && !updateModified && !deleteRemoved) {
            showModal('Selecciona al menos una acción a aplicar.', 'warning');
            return;
        }

        const confirm = await Swal.fire({
            title: '¿Confirmar Sincronización?',
            html: `
                <div class="text-left text-slate-700 text-sm space-y-2">
                    <p>Se van a aplicar los cambios seleccionados a la base de datos:</p>
                    <ul class="list-disc list-inside space-y-1 text-xs">
                        ${importNew ? `<li>Nuevas altas: <strong>${this.currentDiffResult.newStudents.length}</strong> alumnos</li>` : ''}
                        ${updateModified ? `<li>Fichas actualizadas: <strong>${this.currentDiffResult.modifiedStudents.length}</strong> alumnos</li>` : ''}
                        ${deleteRemoved ? `<li>Bajas eliminadas: <strong>${this.currentDiffResult.removedStudents.length}</strong> alumnos</li>` : ''}
                    </ul>
                </div>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, aplicar cambios',
            cancelButtonText: 'Cancelar',
            customClass: {
                popup: 'swal2-popup',
                confirmButton: 'swal2-confirm bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg',
                cancelButton: 'swal2-cancel bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-xl'
            },
            buttonsStyling: false
        });

        if (!confirm.isConfirmed) return;

        try {
            document.getElementById('loading-overlay').classList.remove('hidden');
            const res = await applyDiffSync(this.studentsCollectionRef, this.currentDiffResult, {
                importNew,
                updateModified,
                deleteRemoved
            });

            document.getElementById('loading-overlay').classList.add('hidden');
            this.importResults.classList.add('hidden');
            this.fileNameDisplay.classList.add('hidden');
            this.selectedFile = null;
            this.currentDiffResult = null;
            if (this.fileInput) this.fileInput.value = '';

            Swal.fire({
                icon: 'success',
                title: '¡Sincronización Completada!',
                html: `
                    <div class="text-slate-700 text-sm space-y-1.5 text-left">
                        <p class="text-green-600 font-bold">✓ ${res.addedCount} alumnos nuevos registrados.</p>
                        <p class="text-blue-600 font-bold">✓ ${res.updatedCount} fichas médicas actualizadas.</p>
                        ${res.deletedCount > 0 ? `<p class="text-rose-600 font-bold">✓ ${res.deletedCount} alumnos dados de baja.</p>` : ''}
                    </div>
                `,
                confirmButtonText: 'Aceptar',
                customClass: { popup: 'swal2-popup' }
            });
        } catch (error) {
            document.getElementById('loading-overlay').classList.add('hidden');
            showModal('Error aplicando sincronización: ' + error.message, 'error');
        }
    }
}
