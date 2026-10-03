import { updateDoc, addDoc, deleteDoc, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showModal, showConfirmationModal, closeModal, generatePDF } from "./utils.js";
import { generateReportData } from "./report-service.js";
import { loginWithGoogle, logout, logAction, deleteAllStudents, promoteAllStudents, applyDiffSync, getStoredCourses, saveStoredCourses } from "./firebase-service.js";
import { calculateStudentsDiff, getPromotedCourse } from "./diff-service.js";
import { DEFAULT_COURSES } from "./data.js";

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
        this.customCourses = { "Infantil": [], "Primaria": [], "ESO": [] };

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
        this.manageCoursesBtn = document.getElementById('manage-courses-btn');
        this.clearAllStudentsBtn = document.getElementById('clear-all-students-btn');
        this.addStudentBtn = document.getElementById('add-student-btn');
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
        if (this.manageCoursesBtn) {
            this.manageCoursesBtn.addEventListener('click', () => this.handleManageCourses());
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

    async initCourses() {
        const stored = await getStoredCourses(this.studentsCollectionRef);
        this.customCourses = stored || { "Infantil": [], "Primaria": [], "ESO": [] };
        this.renderCourseButtons();
        this.populateCourseDropdown();
    }

    setCustomCourses(courses) {
        if (!courses) return;
        this.customCourses = courses;
        this.renderCourseButtons();
        this.populateCourseDropdown();
    }

    sortCourses(courses) {
        return courses.slice().sort((a, b) => {
            const numA = parseInt(a, 10);
            const numB = parseInt(b, 10);
            if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
                return numA - numB;
            }
            return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
        });
    }

    getAllCourses(stage) {
        const set = new Set();
        // 1. Cursos oficiales por defecto
        (DEFAULT_COURSES[stage] || []).forEach(c => set.add(c));
        // 2. Cursos personalizados guardados
        (this.customCourses[stage] || []).forEach(c => set.add(c));
        // 3. Cursos que existan en los alumnos actuales
        if (this.processedData && this.processedData[stage]) {
            Object.keys(this.processedData[stage]).forEach(c => set.add(c));
        }
        return this.sortCourses(Array.from(set));
    }

    async addCourseDirectly(stage, courseName, showFeedback = true) {
        const name = (courseName || '').trim();
        if (!name) {
            if (showFeedback) showModal('El nombre del curso no puede estar vacío.', 'warning');
            return false;
        }

        if (!this.customCourses[stage]) {
            this.customCourses[stage] = [];
        }

        if (!this.customCourses[stage].includes(name)) {
            this.customCourses[stage].push(name);
            await saveStoredCourses(this.studentsCollectionRef, this.customCourses);
        }

        this.renderCourseButtons();
        this.populateCourseDropdown();

        if (showFeedback) {
            Swal.fire({
                icon: 'success',
                title: 'Curso Añadido',
                html: `El curso <strong>${name}</strong> se ha añadido correctamente a <strong>${stage}</strong>.`,
                timer: 2000,
                showConfirmButton: false,
                customClass: { popup: 'swal2-popup' }
            });

            // Activar la pestaña de esa etapa y seleccionar el curso
            const stageTab = document.querySelector(`[data-tab="main-tabs"][data-target="${stage.toLowerCase()}"]`);
            if (stageTab) {
                stageTab.click();
                setTimeout(() => {
                    const btn = document.querySelector(`.course-btn[data-course="${name}"]`);
                    if (btn) btn.click();
                }, 100);
            }
        }
        return true;
    }

    async removeCourseDirectly(stage, courseName) {
        const studentsCount = (this.processedData[stage]?.[courseName] || []).length;
        if (studentsCount > 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Curso no vacío',
                text: `No se puede eliminar el curso "${courseName}" porque contiene ${studentsCount} alumno(s). Reubica o elimina los alumnos primero.`,
                customClass: { popup: 'swal2-popup' }
            });
            return;
        }

        const confirm = await Swal.fire({
            title: `¿Eliminar curso "${courseName}"?`,
            text: 'Esta acción quitará el curso de las listas y selectores.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            customClass: {
                popup: 'swal2-popup',
                confirmButton: 'swal2-confirm bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl',
                cancelButton: 'swal2-cancel bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-xl'
            },
            buttonsStyling: false
        });

        if (!confirm.isConfirmed) return;

        if (this.customCourses[stage]) {
            this.customCourses[stage] = this.customCourses[stage].filter(c => c !== courseName);
            await saveStoredCourses(this.studentsCollectionRef, this.customCourses);
        }

        this.renderCourseButtons();
        this.populateCourseDropdown();

        Swal.fire({
            icon: 'success',
            title: 'Curso Eliminado',
            text: `El curso "${courseName}" ha sido eliminado.`,
            timer: 1500,
            showConfirmButton: false,
            customClass: { popup: 'swal2-popup' }
        });
    }

    goToAddStudent(stage, course) {
        const addTab = document.querySelector('[data-tab="main-tabs"][data-target="add-student"]');
        if (addTab) {
            addTab.click();
            setTimeout(() => {
                if (this.studentStageSelect) {
                    this.studentStageSelect.value = stage;
                    this.populateCourseDropdown();
                }
                if (this.studentCourseSelect) {
                    this.studentCourseSelect.value = course;
                    this.toggleNewCourseInput();
                }
                document.getElementById('student-name')?.focus();
            }, 100);
        }
    }

    async promptAddStudentToCourse(stage, course) {
        const { value: formValues } = await Swal.fire({
            title: `➕ Nuevo Alumno en ${course}`,
            html: `
                <div class="text-left space-y-4 text-sm text-slate-700">
                    <div class="bg-indigo-50 border border-indigo-100 p-3 rounded-xl flex items-center justify-between text-xs font-bold text-indigo-900">
                        <span><i class="fas fa-graduation-cap mr-1.5 text-indigo-600"></i>Etapa: ${stage}</span>
                        <span class="bg-indigo-600 text-white px-2.5 py-0.5 rounded-full">${course}</span>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre Completo del Alumno</label>
                        <input id="quick-student-name" type="text" placeholder="Ej: Lucía Gómez Sánchez" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:outline-none font-medium">
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nivel de Alerta Médica</label>
                        <div class="grid grid-cols-3 gap-2 text-center text-xs font-bold">
                            <label class="border-2 border-red-200 rounded-xl p-2.5 cursor-pointer has-[:checked]:bg-red-500 has-[:checked]:text-white has-[:checked]:border-red-500 transition-all text-red-600">
                                <input type="radio" name="quick-severity" value="high" class="hidden">
                                <span>ALTO</span>
                            </label>
                            <label class="border-2 border-amber-200 rounded-xl p-2.5 cursor-pointer has-[:checked]:bg-amber-500 has-[:checked]:text-white has-[:checked]:border-amber-500 transition-all text-amber-600">
                                <input type="radio" name="quick-severity" value="medium" class="hidden">
                                <span>MEDIO</span>
                            </label>
                            <label class="border-2 border-emerald-200 rounded-xl p-2.5 cursor-pointer has-[:checked]:bg-emerald-500 has-[:checked]:text-white has-[:checked]:border-emerald-500 transition-all text-emerald-600">
                                <input type="radio" name="quick-severity" value="low" checked class="hidden">
                                <span>BAJO</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Protocolos de Salud / Alergias / Medicación</label>
                        <textarea id="quick-student-info" rows="4" placeholder="Describa alergias, medicación o 'Sin patologías conocidas'..." class="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:outline-none text-xs leading-relaxed"></textarea>
                    </div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check mr-2"></i>Guardar Alumno',
            cancelButtonText: 'Cancelar',
            customClass: {
                popup: 'swal2-popup',
                confirmButton: 'swal2-confirm bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg',
                cancelButton: 'swal2-cancel bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-xl'
            },
            buttonsStyling: false,
            didOpen: () => {
                document.getElementById('quick-student-name')?.focus();
            },
            preConfirm: () => {
                const name = document.getElementById('quick-student-name')?.value.trim();
                const severity = document.querySelector('input[name="quick-severity"]:checked')?.value || 'low';
                const info = document.getElementById('quick-student-info')?.value.trim() || 'Sin patologías conocidas.\nContacto: No especificado.';

                if (!name) {
                    Swal.showValidationMessage('Por favor introduce el nombre del alumno');
                    return false;
                }

                return { name, severity, info };
            }
        });

        if (!formValues) return;

        const newStudent = {
            name: formValues.name,
            stage,
            course,
            severity: formValues.severity,
            info: formValues.info,
            createdAt: serverTimestamp()
        };

        try {
            document.getElementById('loading-overlay').classList.remove('hidden');
            const docRef = await addDoc(this.studentsCollectionRef, newStudent);
            await logAction('CREATE_STUDENT', { name: newStudent.name, course: newStudent.course });

            // Actualizar memoria local al instante
            this.allStudents.push({ id: docRef.id, ...newStudent });
            this.processAndRenderData();

            // Mantener visualización activa en este curso
            this.renderStudentList(stage, course);
            document.querySelectorAll('.course-btn').forEach(btn => {
                btn.classList.toggle('course-btn-active', btn.dataset.stage === stage && btn.dataset.course === course);
            });

            document.getElementById('loading-overlay').classList.add('hidden');

            Swal.fire({
                icon: 'success',
                title: '¡Alumno Guardado!',
                html: `<strong>${formValues.name}</strong> ha sido añadido/a a <strong>${course}</strong>.`,
                timer: 2000,
                showConfirmButton: false,
                customClass: { popup: 'swal2-popup' }
            });
        } catch (error) {
            document.getElementById('loading-overlay').classList.add('hidden');
            console.error("Error al guardar alumno rápido:", error);
            showModal('Error al guardar el alumno: ' + error.message, 'error');
        }
    }

    async promptAddCourse(defaultStage = 'Infantil') {
        const stage = defaultStage || 'Infantil';
        const officialCourses = DEFAULT_COURSES[stage] || [];
        const currentCourses = this.getAllCourses(stage);
        const missingOfficial = officialCourses.filter(c => !currentCourses.includes(c));

        let suggestionsHtml = '';
        if (missingOfficial.length > 0) {
            suggestionsHtml = `
                <div class="mt-4 text-left">
                    <p class="text-xs text-slate-500 font-semibold mb-2">Cursos oficiales recomendados:</p>
                    <div class="flex flex-wrap gap-2">
                        ${missingOfficial.map(c => `
                            <button type="button" class="course-chip bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors" data-course="${c}">
                                + ${c}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        const { value: formValues } = await Swal.fire({
            title: '➕ Añadir Nuevo Curso',
            html: `
                <div class="text-left space-y-4 text-sm text-slate-700">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Etapa Educativa</label>
                        <select id="swal-course-stage" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:outline-none">
                            <option value="Infantil" ${stage === 'Infantil' ? 'selected' : ''}>Infantil</option>
                            <option value="Primaria" ${stage === 'Primaria' ? 'selected' : ''}>Primaria</option>
                            <option value="ESO" ${stage === 'ESO' ? 'selected' : ''}>ESO</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre del Curso / Grupo</label>
                        <input id="swal-course-name" type="text" placeholder="Ej: 1º Infantil, 1º A Infantil, Aula Específica..." class="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:outline-none font-medium">
                    </div>
                    ${suggestionsHtml}
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Crear Curso',
            cancelButtonText: 'Cancelar',
            customClass: {
                popup: 'swal2-popup',
                confirmButton: 'swal2-confirm bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg',
                cancelButton: 'swal2-cancel bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-xl'
            },
            buttonsStyling: false,
            didOpen: () => {
                const input = document.getElementById('swal-course-name');
                const chips = Swal.getPopup().querySelectorAll('.course-chip');
                chips.forEach(chip => {
                    chip.addEventListener('click', () => {
                        if (input) input.value = chip.dataset.course;
                    });
                });
                if (input) input.focus();
            },
            preConfirm: () => {
                const selectedStage = document.getElementById('swal-course-stage').value;
                const courseName = document.getElementById('swal-course-name').value.trim();
                if (!courseName) {
                    Swal.showValidationMessage('Por favor escribe el nombre del curso');
                    return false;
                }
                return { stage: selectedStage, courseName };
            }
        });

        if (formValues) {
            await this.addCourseDirectly(formValues.stage, formValues.courseName, true);
        }
    }

    async handleManageCourses(defaultStage = 'Infantil') {
        let currentStage = defaultStage || 'Infantil';

        const renderListHtml = (activeStage) => {
            const courses = this.getAllCourses(activeStage);
            if (courses.length === 0) {
                return '<p class="text-slate-400 text-xs italic py-2">No hay cursos en esta etapa.</p>';
            }
            return `
                <div class="space-y-2 max-h-56 overflow-y-auto pr-1">
                    ${courses.map(c => {
                        const count = (this.processedData[activeStage]?.[c] || []).length;
                        return `
                            <div class="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                                <div class="flex items-center gap-2">
                                    <span class="font-bold text-slate-800 text-xs">${c}</span>
                                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${count > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}">
                                        ${count} alumno${count === 1 ? '' : 's'}
                                    </span>
                                </div>
                                ${count === 0 ? `
                                    <button type="button" class="del-course-btn text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition-colors" data-stage="${activeStage}" data-course="${c}" title="Eliminar curso">
                                        <i class="fas fa-trash-alt text-xs"></i>
                                    </button>
                                ` : `
                                    <span class="text-[11px] text-slate-400" title="Contiene alumnos"><i class="fas fa-lock text-[10px]"></i></span>
                                `}
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        };

        const updateModalContent = () => {
            const container = document.getElementById('manage-courses-list-container');
            if (container) {
                container.innerHTML = renderListHtml(currentStage);
                bindDeleteButtons();
            }
        };

        const bindDeleteButtons = () => {
            document.querySelectorAll('.del-course-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const st = btn.dataset.stage;
                    const cr = btn.dataset.course;
                    await this.removeCourseDirectly(st, cr);
                    updateModalContent();
                });
            });
        };

        await Swal.fire({
            title: '📚 Gestión de Cursos Escolares',
            html: `
                <div class="text-left space-y-4 text-sm text-slate-700">
                    <div class="flex border-b border-slate-200 gap-2 pb-2">
                        <button type="button" id="tab-stage-infantil" class="stage-nav-btn px-4 py-2 rounded-xl text-xs font-bold transition-all ${currentStage === 'Infantil' ? 'bg-indigo-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">Infantil</button>
                        <button type="button" id="tab-stage-primaria" class="stage-nav-btn px-4 py-2 rounded-xl text-xs font-bold transition-all ${currentStage === 'Primaria' ? 'bg-indigo-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">Primaria</button>
                        <button type="button" id="tab-stage-eso" class="stage-nav-btn px-4 py-2 rounded-xl text-xs font-bold transition-all ${currentStage === 'ESO' ? 'bg-indigo-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">ESO</button>
                    </div>

                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Cursos configurados</span>
                            <button type="button" id="restore-defaults-btn" class="text-indigo-600 hover:text-indigo-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer">
                                <i class="fas fa-undo"></i> Restaurar oficiales
                            </button>
                        </div>
                        <div id="manage-courses-list-container">
                            ${renderListHtml(currentStage)}
                        </div>
                    </div>

                    <div class="pt-3 border-t border-slate-100">
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Añadir nuevo curso a esta etapa</label>
                        <div class="flex gap-2">
                            <input id="new-course-modal-input" type="text" placeholder="Ej: 1º Infantil, 1º A..." class="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:outline-none text-xs font-medium">
                            <button type="button" id="add-course-modal-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-100 transition-all flex items-center gap-1 cursor-pointer">
                                <i class="fas fa-plus"></i> Añadir
                            </button>
                        </div>
                    </div>
                </div>
            `,
            showConfirmButton: true,
            confirmButtonText: 'Cerrar',
            customClass: {
                popup: 'swal2-popup',
                confirmButton: 'swal2-confirm bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-8 rounded-xl'
            },
            buttonsStyling: false,
            didOpen: () => {
                const setStage = (st) => {
                    currentStage = st;
                    ['infantil', 'primaria', 'eso'].forEach(s => {
                        const b = document.getElementById(`tab-stage-${s}`);
                        if (b) {
                            if (s === st.toLowerCase()) {
                                b.className = 'stage-nav-btn px-4 py-2 rounded-xl text-xs font-bold transition-all bg-indigo-600 text-white shadow';
                            } else {
                                b.className = 'stage-nav-btn px-4 py-2 rounded-xl text-xs font-bold transition-all bg-slate-100 text-slate-600 hover:bg-slate-200';
                            }
                        }
                    });
                    updateModalContent();
                };

                document.getElementById('tab-stage-infantil')?.addEventListener('click', () => setStage('Infantil'));
                document.getElementById('tab-stage-primaria')?.addEventListener('click', () => setStage('Primaria'));
                document.getElementById('tab-stage-eso')?.addEventListener('click', () => setStage('ESO'));

                document.getElementById('add-course-modal-btn')?.addEventListener('click', async () => {
                    const input = document.getElementById('new-course-modal-input');
                    const val = input ? input.value.trim() : '';
                    if (!val) return;
                    await this.addCourseDirectly(currentStage, val, false);
                    if (input) input.value = '';
                    updateModalContent();
                });

                document.getElementById('restore-defaults-btn')?.addEventListener('click', async () => {
                    (DEFAULT_COURSES[currentStage] || []).forEach(c => {
                        if (!this.customCourses[currentStage]) this.customCourses[currentStage] = [];
                        if (!this.customCourses[currentStage].includes(c)) {
                            this.customCourses[currentStage].push(c);
                        }
                    });
                    await saveStoredCourses(this.studentsCollectionRef, this.customCourses);
                    this.renderCourseButtons();
                    this.populateCourseDropdown();
                    updateModalContent();
                });

                bindDeleteButtons();
            }
        });
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
                const courses = this.getAllCourses(stage);

                courses.forEach(course => {
                    const studentCount = coursesData[course]?.length || 0;
                    const button = document.createElement('button');
                    button.className = 'course-btn px-3.5 py-2.5 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200 flex items-center justify-between w-full sm:w-52 md:w-56 shadow-sm border border-slate-200 hover:border-indigo-300 text-xs sm:text-sm';
                    button.dataset.stage = stage;
                    button.dataset.course = course;

                    const badgeClass = studentCount > 0
                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                        : 'bg-slate-100 text-slate-500';

                    button.innerHTML = `
                        <span class="truncate">${course}</span>
                        <span class="ml-1.5 sm:ml-2 text-[11px] sm:text-xs font-black px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full ${badgeClass}">
                            ${studentCount}
                        </span>
                    `;
                    button.addEventListener('click', (e) => this.handleCourseClick(e));
                    container.appendChild(button);
                });

                if (this.isAdminMode) {
                    const addCourseBtn = document.createElement('button');
                    addCourseBtn.className = 'border-2 border-dashed border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50/70 text-indigo-600 px-3.5 py-2.5 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all w-full sm:w-52 md:w-56 cursor-pointer min-h-[42px] sm:min-h-[46px]';
                    addCourseBtn.innerHTML = `<i class="fas fa-plus-circle text-sm"></i>Añadir Curso`;
                    addCourseBtn.title = `Añadir un nuevo curso a ${stage}`;
                    addCourseBtn.addEventListener('click', () => this.promptAddCourse(stage));
                    container.appendChild(addCourseBtn);
                }
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
        const students = this.processedData?.[stage]?.[course] || [];
        const report = this.reportData[stage]?.[course];

        if (!students || students.length === 0) {
            this.studentListContainer.innerHTML = `
                <div class="bg-white p-6 sm:p-12 rounded-2xl sm:rounded-[2.5rem] shadow-xl border border-slate-100 text-center max-w-2xl mx-auto my-6 sm:my-8 space-y-3 sm:space-y-4 animate-fade-in">
                    <div class="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-50 text-emerald-600 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-3 sm:mb-4 text-2xl sm:text-3xl">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h3 class="text-2xl sm:text-3xl font-black text-slate-800">${course}</h3>
                    <p class="text-slate-500 text-xs sm:text-sm">No hay alumnos con alertas médicas registradas en este curso.</p>
                    ${this.isAdminMode ? `
                        <div class="pt-3 sm:pt-4 flex flex-col sm:flex-row justify-center gap-2.5 sm:gap-3">
                            <button class="add-student-to-course-btn w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 cursor-pointer">
                                <i class="fas fa-user-plus"></i>Añadir Alumno a ${course}
                            </button>
                            <button class="remove-empty-course-btn w-full sm:w-auto bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 px-4 sm:px-5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer">
                                <i class="fas fa-trash-alt"></i>Eliminar Curso
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
            const addBtn = this.studentListContainer.querySelector('.add-student-to-course-btn');
            if (addBtn) {
                addBtn.addEventListener('click', () => this.promptAddStudentToCourse(stage, course));
            }
            const remBtn = this.studentListContainer.querySelector('.remove-empty-course-btn');
            if (remBtn) {
                remBtn.addEventListener('click', () => this.removeCourseDirectly(stage, course));
            }
            return;
        }

        let reportHtml = '';
        if (report) {
            reportHtml = `
                <div class="bg-blue-50 border-l-4 border-blue-500 text-blue-800 p-4 sm:p-6 rounded-xl sm:rounded-2xl mb-6 sm:mb-8 shadow-sm sm:shadow-md">
                    <h4 class="text-lg sm:text-xl font-bold mb-3 flex items-center"><i class="fas fa-chart-bar mr-2.5 sm:mr-3"></i>Recomendaciones del Curso</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                        <div>
                            <h5 class="font-semibold mb-1 sm:mb-2 text-xs sm:text-sm text-gray-700">Análisis:</h5>
                            <p class="text-xs sm:text-sm text-gray-600">${report.analysis}</p>
                            <h5 class="font-semibold mt-3 sm:mt-4 mb-1 sm:mb-2 text-xs sm:text-sm text-gray-700">Riesgos:</h5>
                            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm">
                                <span class="flex items-center"><div class="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500 mr-2"></div>Alto: ${report.summary.high}</span>
                                <span class="flex items-center"><div class="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-yellow-500 mr-2"></div>Medio: ${report.summary.medium}</span>
                            </div>
                        </div>
                        <div>
                            <h5 class="font-semibold mb-1 sm:mb-2 text-xs sm:text-sm text-gray-700">Protocolos:</h5>
                            <ul class="list-disc list-inside text-xs sm:text-sm text-gray-600 space-y-1">
                                ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                </div>
            `;
        }

        const getWeight = (s) => (s.severity === 'high' ? 1 : s.severity === 'medium' ? 2 : 3);
        students.sort((a, b) => getWeight(a) - getWeight(b));

        this.studentListContainer.innerHTML = `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-6 sm:mb-8 pb-3 sm:pb-4 border-b border-slate-200">
                <div class="flex items-center gap-3">
                    <h3 class="text-2xl sm:text-3xl font-black text-gray-800">${course}</h3>
                    <span class="bg-indigo-100 text-indigo-800 text-xs font-black px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full">
                        ${students.length} alumno${students.length === 1 ? '' : 's'}
                    </span>
                </div>
                ${this.isAdminMode ? `
                    <button class="add-student-to-course-btn w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl sm:rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 cursor-pointer">
                        <i class="fas fa-user-plus text-sm"></i>Añadir Alumno a ${course}
                    </button>
                ` : ''}
            </div>
        `;
        this.studentListContainer.innerHTML += reportHtml;
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6';

        students.forEach(student => grid.appendChild(this.createStudentCard(student)));
        this.studentListContainer.appendChild(grid);

        const addStudentBtn = this.studentListContainer.querySelector('.add-student-to-course-btn');
        if (addStudentBtn) {
            addStudentBtn.addEventListener('click', () => this.promptAddStudentToCourse(stage, course));
        }
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
        card.className = `student-card p-4 sm:p-5 ${borderColor} ${cardBgColor}`;

        let adminButtonsHtml = '';
        if (this.isAdminMode) {
            adminButtonsHtml = `
                <div class="mt-4 pt-3 border-t flex gap-2">
                    <button class="edit-btn flex-1 sm:flex-initial px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 min-h-[38px]"><i class="fas fa-edit"></i> Editar</button>
                    <button class="delete-btn flex-1 sm:flex-initial px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 min-h-[38px]"><i class="fas fa-trash-alt"></i> Borrar</button>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="cursor-pointer detail-trigger group">
                <h4 class="font-bold text-lg sm:text-xl group-hover:text-indigo-600 transition-colors">${student.name}</h4>
                <p class="text-gray-500 text-xs sm:text-sm mb-2">${student.course}</p>
                <div class="mb-3">${alertsHtml}</div>
                <div class="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-3 text-center group-hover:bg-indigo-50 group-hover:border-indigo-300 transition-all">
                    <p class="text-[11px] sm:text-xs font-bold text-gray-400 group-hover:text-indigo-500 uppercase tracking-widest">
                        <i class="fas fa-eye-slash mr-1.5 sm:mr-2"></i>Información Protegida
                    </p>
                    <p class="text-xs sm:text-sm text-gray-500 mt-1">Haz clic para ver detalles médicos</p>
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
            <div id="detail-modal-backdrop" class="fixed inset-0 flex items-center justify-center z-50 p-3 sm:p-4">
                <div class="modal-content-container w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-8 relative rounded-2xl sm:rounded-3xl">
                    <button class="absolute top-4 right-4 sm:top-5 sm:right-5 text-2xl sm:text-3xl close-detail p-1 text-slate-400 hover:text-slate-600 transition-colors"><i class="fas fa-times-circle"></i></button>
                    <h3 class="text-2xl sm:text-3xl font-black mb-4 sm:mb-6 pr-8 text-indigo-700">${student.name}</h3>
                    <div class="info-section p-4 sm:p-6 bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-100">
                        <p class="text-slate-700 whitespace-pre-line text-sm sm:text-base leading-relaxed">${student.info}</p>
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

        const currentStage = student.stage || 'Infantil';
        const currentCourse = student.course || '';

        const renderCourseOptions = (st, selectedCourse) => {
            const list = this.getAllCourses(st);
            return list.map(c => `<option value="${c}" ${c === selectedCourse ? 'selected' : ''}>${c}</option>`).join('') +
                   `<option value="new">➕ Otro... (Nuevo curso)</option>`;
        };

        const modalHtml = `
            <div id="${modalId}" class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in">
                <div class="bg-white p-5 sm:p-8 md:p-10 rounded-2xl sm:rounded-[2.5rem] shadow-2xl w-full max-w-2xl border border-slate-100 max-h-[92vh] overflow-y-auto">
                    <div class="flex items-center justify-between border-b border-slate-100 pb-3 sm:pb-4 mb-4 sm:mb-6">
                        <div class="pr-2">
                            <span class="text-xs font-black text-indigo-600 uppercase tracking-widest">Edición de Ficha</span>
                            <h3 class="text-xl sm:text-2xl font-black text-slate-800 break-words">${student.name}</h3>
                        </div>
                        <button type="button" class="cancel-edit text-slate-400 hover:text-slate-600 text-2xl p-1 cursor-pointer touch-manipulation">
                            <i class="fas fa-times-circle"></i>
                        </button>
                    </div>

                    <form id="edit-student-form" class="space-y-4 sm:space-y-6">
                        <input type="hidden" id="edit-student-id" value="${student.id}">

                        <div>
                            <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5 sm:mb-2">Nombre Completo</label>
                            <input type="text" id="edit-student-name" class="w-full px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border-2 border-slate-200 focus:border-indigo-500 focus:outline-none font-semibold text-slate-800 transition-colors text-sm sm:text-base" value="${student.name}" required>
                        </div>

                        <!-- Reasignación de Etapa y Curso -->
                        <div class="bg-indigo-50/50 border border-indigo-100 p-4 sm:p-5 rounded-2xl space-y-3 sm:space-y-4">
                            <h4 class="text-xs font-black text-indigo-900 uppercase tracking-wider flex items-center gap-2">
                                <i class="fas fa-exchange-alt text-indigo-600"></i>Reasignar Curso y Etapa
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                                <div>
                                    <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Etapa Educativa</label>
                                    <select id="edit-student-stage" class="w-full px-3.5 sm:px-4 py-2.5 rounded-xl border border-indigo-200 bg-white focus:border-indigo-500 focus:outline-none text-xs font-bold text-slate-700 min-h-[42px]">
                                        <option value="Infantil" ${currentStage === 'Infantil' ? 'selected' : ''}>Infantil</option>
                                        <option value="Primaria" ${currentStage === 'Primaria' ? 'selected' : ''}>Primaria</option>
                                        <option value="ESO" ${currentStage === 'ESO' ? 'selected' : ''}>ESO</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Curso / Grupo</label>
                                    <select id="edit-student-course" class="w-full px-3.5 sm:px-4 py-2.5 rounded-xl border border-indigo-200 bg-white focus:border-indigo-500 focus:outline-none text-xs font-bold text-slate-700 min-h-[42px]">
                                        ${renderCourseOptions(currentStage, currentCourse)}
                                    </select>
                                </div>
                            </div>
                            <div id="edit-new-course-container" class="hidden">
                                <label class="block text-[11px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Nombre del nuevo curso</label>
                                <input type="text" id="edit-new-course-name" class="w-full px-3.5 sm:px-4 py-2.5 rounded-xl border border-indigo-300 bg-white focus:outline-none text-xs font-semibold" placeholder="Ej: 1º Infantil, 1º A...">
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5 sm:mb-2">Nivel de Alerta Médica</label>
                            <div class="grid grid-cols-3 gap-2 sm:gap-3">
                                <label class="border-2 border-red-200 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 text-center cursor-pointer transition-all has-[:checked]:bg-red-500 has-[:checked]:text-white has-[:checked]:border-red-500 text-red-600 font-bold text-xs flex items-center justify-center min-h-[44px]">
                                    <input type="radio" name="edit-severity" value="high" ${student.severity === 'high' ? 'checked' : ''} class="hidden">
                                    <span>ALTO</span>
                                </label>
                                <label class="border-2 border-amber-200 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 text-center cursor-pointer transition-all has-[:checked]:bg-amber-500 has-[:checked]:text-white has-[:checked]:border-amber-500 text-amber-600 font-bold text-xs flex items-center justify-center min-h-[44px]">
                                    <input type="radio" name="edit-severity" value="medium" ${student.severity === 'medium' ? 'checked' : ''} class="hidden">
                                    <span>MEDIO</span>
                                </label>
                                <label class="border-2 border-emerald-200 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 text-center cursor-pointer transition-all has-[:checked]:bg-emerald-500 has-[:checked]:text-white has-[:checked]:border-emerald-500 text-emerald-600 font-bold text-xs flex items-center justify-center min-h-[44px]">
                                    <input type="radio" name="edit-severity" value="low" ${student.severity === 'low' ? 'checked' : ''} class="hidden">
                                    <span>BAJO</span>
                                </label>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5 sm:mb-2">Protocolos de Salud / Observaciones</label>
                            <textarea id="edit-student-info" rows="5" class="w-full px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border-2 border-slate-200 focus:border-indigo-500 focus:outline-none text-xs text-slate-700 leading-relaxed font-normal" required>${student.info}</textarea>
                        </div>

                        <div class="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-3 sm:pt-4 border-t border-slate-100">
                            <button type="button" class="cancel-edit w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-3 rounded-xl font-bold text-xs transition-colors min-h-[44px]">Cancelar</button>
                            <button type="submit" class="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold text-xs shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 min-h-[44px]">
                                <i class="fas fa-save"></i>Guardar Cambios
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const stageSelect = document.getElementById('edit-student-stage');
        const courseSelect = document.getElementById('edit-student-course');
        const newCourseContainer = document.getElementById('edit-new-course-container');

        stageSelect.addEventListener('change', () => {
            const st = stageSelect.value;
            courseSelect.innerHTML = renderCourseOptions(st, '');
            newCourseContainer.classList.add('hidden');
        });

        courseSelect.addEventListener('change', () => {
            const isNew = courseSelect.value === 'new';
            newCourseContainer.classList.toggle('hidden', !isNew);
            if (isNew) {
                document.getElementById('edit-new-course-name')?.focus();
            }
        });

        document.getElementById('edit-student-form').addEventListener('submit', (e) => this.handleEditSubmit(e));
        document.querySelectorAll('.cancel-edit').forEach(btn => {
            btn.onclick = () => closeModal(modalId);
        });
    }

    async handleEditSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('edit-student-id').value;
        const name = document.getElementById('edit-student-name').value.trim();
        const stage = document.getElementById('edit-student-stage').value;
        const courseSelect = document.getElementById('edit-student-course');
        let course = courseSelect.value === 'new'
            ? document.getElementById('edit-new-course-name').value.trim()
            : courseSelect.value;

        if (courseSelect.value === 'new') {
            if (!course) {
                showModal('Por favor escribe el nombre del nuevo curso.', 'warning');
                document.getElementById('edit-new-course-name')?.focus();
                return;
            }
            await this.addCourseDirectly(stage, course, false);
        }

        if (!course) {
            showModal('Por favor selecciona un curso.', 'warning');
            return;
        }

        const info = document.getElementById('edit-student-info').value.trim();
        const severity = document.querySelector('input[name="edit-severity"]:checked')?.value || 'low';

        const newData = {
            name,
            stage,
            course,
            info,
            severity,
            updatedAt: serverTimestamp()
        };

        try {
            document.getElementById('loading-overlay').classList.remove('hidden');
            await updateDoc(doc(this.db, this.studentsCollectionRef.path, id), newData);
            await logAction('UPDATE_STUDENT', { id, after: { name, stage, course, severity } });

            // Actualizar memoria local al instante
            const idx = this.allStudents.findIndex(s => s.id === id);
            if (idx !== -1) {
                this.allStudents[idx] = { ...this.allStudents[idx], ...newData };
            }
            this.processAndRenderData();

            // Refrescar vista del curso
            this.renderStudentList(stage, course);
            document.querySelectorAll('.course-btn').forEach(btn => {
                btn.classList.toggle('course-btn-active', btn.dataset.stage === stage && btn.dataset.course === course);
            });

            document.getElementById('loading-overlay').classList.add('hidden');
            closeModal('edit-student-modal');

            Swal.fire({
                icon: 'success',
                title: 'Ficha Actualizada',
                html: `<strong>${name}</strong> ha sido actualizado/a correctamente en <strong>${course}</strong>.`,
                timer: 2000,
                showConfirmButton: false,
                customClass: { popup: 'swal2-popup' }
            });
        } catch (error) {
            document.getElementById('loading-overlay').classList.add('hidden');
            console.error("Error al actualizar estudiante:", error);
            showModal('Error al actualizar: ' + error.message, 'error');
        }
    }

    confirmDeleteStudent(id, name) {
        showConfirmationModal(`¿Eliminar a ${name}?`, () => this.deleteStudent(id, name));
    }

    async deleteStudent(id, name) {
        try {
            document.getElementById('loading-overlay').classList.remove('hidden');
            await deleteDoc(doc(this.db, this.studentsCollectionRef.path, id));
            await logAction('DELETE_STUDENT', { id, name });
            this.allStudents = this.allStudents.filter(s => s.id !== id);
            this.processAndRenderData();
            document.getElementById('loading-overlay').classList.add('hidden');
            showModal('Eliminado correctamente.', 'success');
        } catch (error) {
            document.getElementById('loading-overlay').classList.add('hidden');
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
            ['pdf-download-btn', 'promote-courses-btn', 'manage-courses-btn', 'clear-all-students-btn', 'add-student-btn', 'import-data-btn'].forEach(id => document.getElementById(id)?.classList.remove('hidden'));
        } else {
            this.adminToggleButton.innerHTML = `<i class="fas fa-user-shield mr-2"></i>Modo Admin`;
            this.adminToggleButton.classList.replace('bg-green-500', 'bg-amber-400');
            ['pdf-download-btn', 'promote-courses-btn', 'manage-courses-btn', 'clear-all-students-btn', 'add-student-btn', 'import-data-btn'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
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
        const stage = this.studentStageSelect ? this.studentStageSelect.value : 'Infantil';
        let course = this.studentCourseSelect.value === 'new' ? this.newCourseNameInput.value.trim() : this.studentCourseSelect.value;

        if (this.studentCourseSelect.value === 'new') {
            if (!course) {
                showModal('Por favor, indica el nombre del nuevo curso.', 'warning');
                if (this.newCourseNameInput) this.newCourseNameInput.focus();
                return;
            }
            // Registrar el nuevo curso en la configuración
            await this.addCourseDirectly(stage, course, false);
        }

        if (!course) {
            showModal('Por favor, selecciona o introduce un curso.', 'warning');
            return;
        }

        const student = {
            name: document.getElementById('student-name').value.trim(),
            stage,
            course,
            info: document.getElementById('student-info').value.trim(),
            severity: document.querySelector('input[name="severity"]:checked')?.value || 'low',
            createdAt: serverTimestamp()
        };

        try {
            document.getElementById('loading-overlay').classList.remove('hidden');
            const docRef = await addDoc(this.studentsCollectionRef, student);
            await logAction('CREATE_STUDENT', { name: student.name, course: student.course });

            // Actualizar memoria local al instante
            this.allStudents.push({ id: docRef.id, ...student });
            this.processAndRenderData();

            this.addStudentForm.reset();
            this.populateCourseDropdown();
            document.getElementById('loading-overlay').classList.add('hidden');
            showModal(`Alumno añadido con éxito en ${course}.`, 'success');
        } catch (error) {
            document.getElementById('loading-overlay').classList.add('hidden');
            console.error("Error al añadir estudiante:", error);
            showModal('Error al añadir el registro.', 'error');
        }
    }

    populateCourseDropdown() {
        if (!this.studentStageSelect || !this.studentCourseSelect) return;
        const stage = this.studentStageSelect.value;
        const courses = this.getAllCourses(stage);
        this.studentCourseSelect.innerHTML = courses.map(c => `<option value="${c}">${c}</option>`).join('') + '<option value="new">➕ Otro... (Crear nuevo curso)</option>';
        this.toggleNewCourseInput();
    }

    toggleNewCourseInput() {
        if (this.studentCourseSelect && this.newCourseContainer) {
            const isNew = this.studentCourseSelect.value === 'new';
            this.newCourseContainer.classList.toggle('hidden', !isNew);
            if (isNew && this.newCourseNameInput) {
                setTimeout(() => this.newCourseNameInput.focus(), 50);
            }
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
                <div class="mt-4 border border-amber-200 rounded-2xl bg-amber-50/60 p-3.5 sm:p-5 space-y-3 text-xs">
                    <h5 class="font-bold text-amber-900 uppercase tracking-wider text-xs flex flex-wrap items-center justify-between gap-1">
                        <span><i class="fas fa-edit mr-2 text-amber-600"></i>Fichas con Cambios Médicos o de Curso (${modifiedStudents.length})</span>
                        <span class="text-[10px] font-normal text-amber-700">Revisa las modificaciones detectadas</span>
                    </h5>
                    <div class="max-h-72 overflow-y-auto space-y-3 pr-1">
                        ${modifiedStudents.map(m => `
                            <div class="bg-white p-3 sm:p-3.5 rounded-xl shadow-sm border border-amber-100 space-y-2">
                                <div class="flex flex-wrap items-center justify-between gap-1.5 font-bold text-slate-800 text-sm">
                                    <span class="break-words">${m.name}</span>
                                    <span class="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                                        ${m.existing.course} ${m.existing.course !== m.incoming.course ? `➔ ${m.incoming.course}` : ''}
                                    </span>
                                </div>
                                <div class="space-y-1.5 text-slate-600">
                                    ${m.changes.severity ? `
                                        <div class="flex flex-wrap items-center gap-2">
                                            <span class="font-semibold text-slate-700">Nivel de Riesgo:</span>
                                            ${severityBadge(m.changes.severity.from)} ➔ ${severityBadge(m.changes.severity.to)}
                                        </div>
                                    ` : ''}
                                    ${m.changes.info ? `
                                        <div class="mt-1">
                                            <span class="font-semibold text-slate-700">Observaciones / Tratamiento modificado:</span>
                                            <div class="text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-100 mt-1 whitespace-pre-line text-slate-700 font-mono break-words">
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
                <details class="mt-4 border border-emerald-200 rounded-2xl bg-emerald-50/40 p-3.5 sm:p-4 text-xs">
                    <summary class="font-bold text-emerald-900 cursor-pointer uppercase tracking-wider text-xs flex flex-wrap items-center justify-between gap-1">
                        <span><i class="fas fa-user-plus mr-2 text-emerald-600"></i>Nuevas Altas detectadas (${newStudents.length})</span>
                        <span class="text-[10px] text-emerald-600 font-normal">Hacer clic para desplegar</span>
                    </summary>
                    <div class="mt-3 max-h-52 overflow-y-auto space-y-1.5 pt-2 pr-1">
                        ${newStudents.map(n => `
                            <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-emerald-100 text-slate-700">
                                <div>
                                    <span class="font-bold text-slate-800 break-words">${n.name}</span>
                                    <span class="text-slate-400 text-[11px] ml-1.5 font-medium">(${n.course})</span>
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
                <details class="mt-4 border border-rose-200 rounded-2xl bg-rose-50/40 p-3.5 sm:p-4 text-xs">
                    <summary class="font-bold text-rose-900 cursor-pointer uppercase tracking-wider text-xs flex flex-wrap items-center justify-between gap-1">
                        <span><i class="fas fa-user-minus mr-2 text-rose-600"></i>Alumnos actuales no listados en el Excel (${removedStudents.length})</span>
                        <span class="text-[10px] text-rose-600 font-normal">Hacer clic para desplegar</span>
                    </summary>
                    <div class="mt-3 max-h-52 overflow-y-auto space-y-1.5 pt-2 pr-1">
                        ${removedStudents.map(r => `
                            <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-rose-100 text-slate-700">
                                <span class="font-semibold text-slate-800 break-words">${r.name} (${r.course})</span>
                                <span class="text-rose-600 font-medium text-[11px] bg-rose-50 px-2 py-0.5 rounded border border-rose-100">No incluido</span>
                            </div>
                        `).join('')}
                    </div>
                </details>
            `;
        }

        this.importResults.innerHTML = `
            <div class="space-y-4 sm:space-y-6 animate-fade-in">
                <div class="text-center">
                    <h4 class="text-xl sm:text-2xl font-black text-slate-800">Resultado del Análisis Comparativo</h4>
                    <p class="text-xs text-slate-500 mt-1">
                        Alumnos en el archivo entrante: <strong>${totalIncoming}</strong> · Alumnos en la app: <strong>${totalCurrent}</strong>
                    </p>
                </div>

                <!-- 4 Tarjetas Métricas -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-center">
                    <div class="bg-emerald-50 border border-emerald-200 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                        <div class="text-xl sm:text-2xl font-black text-emerald-600">${newStudents.length}</div>
                        <div class="text-[10px] sm:text-[11px] font-bold text-emerald-800 uppercase tracking-wider mt-1">Nuevas Altas</div>
                    </div>
                    <div class="bg-amber-50 border border-amber-200 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                        <div class="text-xl sm:text-2xl font-black text-amber-600">${modifiedStudents.length}</div>
                        <div class="text-[10px] sm:text-[11px] font-bold text-amber-800 uppercase tracking-wider mt-1">Fichas Modificadas</div>
                    </div>
                    <div class="bg-slate-100 border border-slate-200 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                        <div class="text-xl sm:text-2xl font-black text-slate-600">${unchangedStudents.length}</div>
                        <div class="text-[10px] sm:text-[11px] font-bold text-slate-700 uppercase tracking-wider mt-1">Sin Cambios</div>
                    </div>
                    <div class="bg-rose-50 border border-rose-200 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                        <div class="text-xl sm:text-2xl font-black text-rose-600">${removedStudents.length}</div>
                        <div class="text-[10px] sm:text-[11px] font-bold text-rose-800 uppercase tracking-wider mt-1">No Presentes</div>
                    </div>
                </div>

                ${modifiedDetailsHtml}
                ${newStudentsHtml}
                ${removedStudentsHtml}

                <!-- Acciones a aplicar -->
                <div class="bg-slate-100/80 p-4 sm:p-5 rounded-2xl space-y-2.5 text-xs text-slate-700 font-medium">
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

                <div class="flex flex-col-reverse sm:flex-row justify-center gap-3 pt-3">
                    <button id="cancel-diff-btn"
                        class="w-full sm:w-auto bg-slate-200 hover:bg-slate-300 text-slate-700 px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm transition-all min-h-[48px]">
                        Cancelar
                    </button>
                    <button id="apply-diff-btn"
                        class="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-6 sm:px-10 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider sm:tracking-widest shadow-xl shadow-emerald-200 flex items-center justify-center gap-2 sm:gap-3 transition-all min-h-[48px]">
                        <i class="fas fa-check-double"></i>Confirmar y Aplicar Cambios
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

            // Registrar nuevos cursos traídos por el Excel en la configuración permanente
            if (this.currentDiffResult) {
                const incoming = [...(this.currentDiffResult.newStudents || []), ...(this.currentDiffResult.modifiedStudents || []).map(m => m.incoming)];
                let hasNewCourses = false;
                incoming.forEach(st => {
                    if (st && st.stage && st.course) {
                        if (!this.customCourses[st.stage]) this.customCourses[st.stage] = [];
                        if (!this.customCourses[st.stage].includes(st.course)) {
                            this.customCourses[st.stage].push(st.course);
                            hasNewCourses = true;
                        }
                    }
                });
                if (hasNewCourses) {
                    await saveStoredCourses(this.studentsCollectionRef, this.customCourses);
                    this.renderCourseButtons();
                    this.populateCourseDropdown();
                }
            }

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
