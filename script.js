$(document).ready(function() {
    // --- CONFIGURATION ---
    const API_BASE_URL = "https://timesheet-api-2409-acb0gbfhczgreaag.canadacentral-01.azurewebsites.net/api";

    // --- STATE MANAGEMENT ---
    let deleteAction = null;
    let hoursLoggedChart = null;
    let projectBreakdownChart = null;
    
    // --- GLOBAL AJAX HANDLER for 401 ERRORS ---
    $(document).ajaxError(function(event, jqXHR, ajaxSettings, thrownError) {
        if (jqXHR.status === 401) {
            localStorage.clear();
            updateUIVisibility(false);
            showView('#login-view');
            $('form').removeClass('was-validated').trigger('reset');
            if ($('.toast.show').length === 0) {
                 showNotification('Your session has expired. Please log in again.', true);
            }
        }
    });

    // --- INITIALIZATION ---
    checkLoginStatus();

    // --- VIEW MANAGEMENT ---
    function showView(viewId) {
        $('.main-view').hide();
        $(viewId).show();

        const viewTitle = $(`[data-view='${viewId}'] a`).text() || "Dashboard";
        $('#view-title').text(viewTitle);
        
        $('.nav-item').removeClass('active');
        $(`[data-view='${viewId}']`).addClass('active');
    }

    function updateUIVisibility(isLoggedIn) {
        if (isLoggedIn) {
            $('body').removeClass('login-mode');
        } else {
            $('body').addClass('login-mode');
        }
    }

    function checkLoginStatus() {
        const token = localStorage.getItem('token');
        if (token) {
            loadInitialView();
        } else {
            updateUIVisibility(false);
            showView('#login-view');
        }
    }

    function loadInitialView() {
        const role = localStorage.getItem('role');
        const employeeId = localStorage.getItem('id');
        
        if (!employeeId) {
            checkLoginStatus();
            return;
        }

        if (role === 'Admin') {
            apiCall(`/Employee/${employeeId}`, 'GET')
                .done(function(employeeData) {
                    localStorage.setItem('name', employeeData.name);
                    updateNavbar(true);
                    updateUIVisibility(true);
                    loadTeamView(); 
                })
                .fail(function(jqXHR){
                    console.error("Failed to fetch admin data on startup, session may be invalid.");
                });
        } else {
            updateNavbar(true);
            updateUIVisibility(true);
            loadOverviewView();
        }
    }
    
    function updateNavbar(isLoggedIn) {
        if (isLoggedIn) {
            const name = localStorage.getItem('name') || 'User';
            $('#user-info-name').text(name);
            $('#user-info').show();
        } else {
            $('#user-info').hide();
        }
    }
    
    // --- UTILITIES ---
    function showNotification(message, isError = false) {
        const toastId = 'toast-' + new Date().getTime();
        const $toastHTML = $(`
            <div id="${toastId}" class="toast align-items-center text-white ${isError ? 'bg-danger' : 'bg-success'}" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">${message}</div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>`);
        
        $('#notification-container').append($toastHTML);
        const toastElement = new bootstrap.Toast($toastHTML[0]);
        toastElement.show();
        setTimeout(() => $toastHTML.remove(), 5000);
    }
    
    function handleApiError(jqXHR, defaultMessage) {
        if (jqXHR.status === 401) return; 

        let message = defaultMessage;
        if (jqXHR.responseJSON) {
            const response = jqXHR.responseJSON;
            if (response.errors && typeof response.errors === 'object') {
                message = Object.values(response.errors).flat().join(' ');
            } else if (response.title) {
                message = response.title;
            }
        } else if (jqXHR.responseText) {
            message = jqXHR.responseText;
        }
        showNotification(message, true);
    }

    // --- API CALLS ---
    function apiCall(endpoint, method, data) {
        return $.ajax({
            url: `${API_BASE_URL}${endpoint}`,
            method: method,
            contentType: 'application/json',
            data: data ? JSON.stringify(data) : null,
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
    }

    // --- AUTHENTICATION ---
    $('#login-form').on('submit', function(e) {
        e.preventDefault();
        if (!this.checkValidity()) { $(this).addClass('was-validated'); return; }
        
        const loginData = { email: $('#login-email').val(), password: $('#login-password').val() };

        apiCall('/Auth/login', 'POST', loginData)
            .done(function(data) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('role', data.role);
                localStorage.setItem('id', data.id);
                showNotification('Login successful!');
                checkLoginStatus();
            })
            .fail(jqXHR => handleApiError(jqXHR, 'Invalid email or password.'));
    });

    $('#register-form').on('submit', function(e) {
        e.preventDefault();
        if (!this.checkValidity()) { $(this).addClass('was-validated'); return; }

        const registerData = {
            name: $('#register-name').val(),
            email: $('#register-email').val(),
            password: $('#register-password').val(),
            role: $('#register-role').val()
        };

        apiCall('/Auth/register', 'POST', registerData)
            .done(function() {
                localStorage.setItem('name', registerData.name);
                showNotification('Registration successful! Please login.');
                $('#login-tab-btn').tab('show');
                $('#login-email').val(registerData.email);
            })
            .fail(jqXHR => handleApiError(jqXHR, 'Registration failed.'));
    });
    
    $('#logout-btn').on('click', function() {
        localStorage.clear();
        checkLoginStatus();
        showNotification('You have been logged out.');
    });

    // --- NAVIGATION ---
    $('.nav-links').on('click', '.nav-item', function(e) {
        e.preventDefault();
        const viewId = $(this).data('view');
        
        switch (viewId) {
            case '#overview-view':
                loadOverviewView();
                break;
            case '#team-view':
                loadTeamView();
                break;
            case '#projects-view':
            case '#payments-view':
            case '#reports-view':
            case '#settings-view':
                showView(viewId);
                break;
        }
    });

    // --- CHARTING FUNCTIONS ---
    function createHoursLoggedChart(timesheets) {
        const ctx = document.getElementById('hours-logged-chart').getContext('2d');
        const data = {};
        timesheets.forEach(ts => {
            const date = new Date(ts.date).toLocaleDateString();
            data[date] = (data[date] || 0) + ts.hoursWorked;
        });

        if(hoursLoggedChart) hoursLoggedChart.destroy();
        hoursLoggedChart = new Chart(ctx, {
            type: 'line', data: { 
                labels: Object.keys(data), 
                datasets: [{ label: 'Hours Worked', data: Object.values(data),
                    borderColor: 'rgba(37, 99, 235, 1)',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    fill: true, tension: 0.3
                }]
            }, options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function createProjectBreakdownChart(timesheets) {
        const ctx = document.getElementById('project-breakdown-chart').getContext('2d');
        const data = {};
        timesheets.forEach(ts => {
            const project = ts.taskDetails.split(' ')[0] || 'General';
            data[project] = (data[project] || 0) + ts.hoursWorked;
        });

        if(projectBreakdownChart) projectBreakdownChart.destroy();
        projectBreakdownChart = new Chart(ctx, {
            type: 'pie', data: { 
                labels: Object.keys(data), 
                datasets: [{ label: 'Hours by Project', data: Object.values(data),
                    backgroundColor: ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd']
                }]
            }, options: { responsive: true, maintainAspectRatio: false }
        });
    }
    
    // --- VIEW LOADERS ---
    function loadOverviewView() {
        const employeeId = localStorage.getItem('id');
        apiCall(`/Timesheet/employee/${employeeId}`, 'GET')
            .done(function(timesheetData) {
                showView('#overview-view');
                const safeTimesheets = Array.isArray(timesheetData) ? timesheetData : (timesheetData ? [timesheetData] : []);
                renderTimesheetTable(safeTimesheets);
                setTimeout(() => {
                    createHoursLoggedChart(safeTimesheets);
                    createProjectBreakdownChart(safeTimesheets);
                }, 100);
            }).fail(jqXHR => handleApiError(jqXHR, 'Failed to load overview data.'));
    }
    
    function loadTeamView() {
        showView('#team-view');
        apiCall('/Employee', 'GET')
            .done(function(employees) {
                const $tbody = $('#admin-employee-table-body');
                $tbody.empty();
                employees.forEach(emp => {
                    $tbody.append(`
                        <tr>
                            <td>${emp.name}</td>
                            <td>${emp.email}</td>
                            <td>${emp.role}</td>
                            <td>
                                <button class="btn btn-sm btn-outline-danger delete-employee-btn" data-id="${emp.id}" data-name="${emp.name}"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>`);
                });
            }).fail(jqXHR => handleApiError(jqXHR, 'Failed to load team members.'));
    }

    function renderTimesheetTable(timesheets) {
        const $tbody = $('#recent-timesheets-body');
        $tbody.empty();
        if (timesheets && timesheets.length > 0) {
            timesheets.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5).forEach(ts => {
                const date = new Date(ts.date).toLocaleDateString();
                $tbody.append(`
                    <tr>
                        <td>${date}</td>
                        <td>${ts.taskDetails.split(' ')[0] || 'General'}</td>
                        <td>${ts.taskDetails}</td>
                        <td>${ts.hoursWorked.toFixed(1)}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary edit-timesheet-btn" data-id="${ts.id}"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-sm btn-outline-danger delete-timesheet-btn" data-id="${ts.id}"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>`);
            });
        } else {
            $tbody.append('<tr><td colspan="5" class="text-center">No recent timesheets found.</td></tr>');
        }
    }
    
    // --- MODAL & ACTIONS ---
    const timesheetModal = new bootstrap.Modal(document.getElementById('timesheet-modal'));
    
    $('body').on('click', '#add-timesheet-btn', function() {
        $('#timesheet-form').trigger('reset').removeClass('was-validated');
        $('#timesheet-modal-title').text('Add Timesheet');
        $('#timesheet-id').val('');
        timesheetModal.show();
    });
    
    $('body').on('click', '.edit-timesheet-btn', function() {
        const id = $(this).data('id');
        const employeeId = localStorage.getItem('id');
        apiCall(`/Timesheet/employee/${employeeId}`, 'GET')
            .done(function(timesheets) {
                const safeTimesheets = Array.isArray(timesheets) ? timesheets : [];
                const timesheet = safeTimesheets.find(ts => ts.id === id);
                if(timesheet) {
                    $('#timesheet-form').trigger('reset').removeClass('was-validated');
                    $('#timesheet-modal-title').text('Edit Timesheet');
                    $('#timesheet-id').val(timesheet.id);
                    $('#timesheet-date').val(new Date(timesheet.date).toISOString().split('T')[0]);
                    $('#timesheet-hours').val(timesheet.hoursWorked);
                    $('#timesheet-details').val(timesheet.taskDetails);
                    timesheetModal.show();
                }
            });
    });

    $('#save-timesheet-btn').on('click', function() {
        const form = document.getElementById('timesheet-form');
        if (!form.checkValidity()) { $(form).addClass('was-validated'); return; }

        const id = $('#timesheet-id').val();
        const employeeId = parseInt(localStorage.getItem('id'));
        const timesheetData = {
            id: id ? parseInt(id) : 0, employeeId,
            date: $('#timesheet-date').val(),
            hoursWorked: parseFloat($('#timesheet-hours').val()),
            taskDetails: $('#timesheet-details').val()
        };

        const method = id ? 'PUT' : 'POST';
        const endpoint = id ? `/Timesheet/${id}` : '/Timesheet';
        
        apiCall(endpoint, method, timesheetData)
            .done(function() {
                showNotification(`Timesheet ${id ? 'updated' : 'added'}.`);
                timesheetModal.hide();
                loadOverviewView();
            })
            .fail(jqXHR => handleApiError(jqXHR, `Failed to save timesheet.`));
    });
    
    const deleteModal = new bootstrap.Modal(document.getElementById('confirm-delete-modal'));

    $('body').on('click', '.delete-employee-btn, .delete-timesheet-btn', function() {
        const isEmployeeDelete = $(this).hasClass('delete-employee-btn');
        const id = $(this).data('id');
        
        if (isEmployeeDelete) {
            const name = $(this).data('name');
            $('#delete-message').text(`Delete employee "${name}"?`);
            deleteAction = () => apiCall(`/Employee/${id}`, 'DELETE')
                                .done(() => { showNotification('Employee deleted.'); loadTeamView(); })
                                .fail(jqXHR => handleApiError(jqXHR, 'Failed to delete employee.'));
        } else {
            $('#delete-message').text('Delete this timesheet entry?');
            deleteAction = () => apiCall(`/Timesheet/${id}`, 'DELETE')
                                .done(() => { showNotification('Timesheet deleted.'); loadOverviewView(); })
                                .fail(jqXHR => handleApiError(jqXHR, 'Failed to delete timesheet.'));
        }
        deleteModal.show();
    });

    $('#confirm-delete-btn').on('click', function() {
        if (typeof deleteAction === 'function') {
            deleteAction();
        }
        deleteModal.hide();
        deleteAction = null;
    });
});

