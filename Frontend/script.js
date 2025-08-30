$(document).ready(function() {
    
    const API_BASE_URL = "https://timesheet-api-2409-acb0gbfhczgreaag.canadacentral-01.azurewebsites.net/api"; 
    
   
    let deleteAction = null; // To store which delete function to call

    // Check for existing token on page load
    const token = localStorage.getItem('token');
    if (token) {
        updateNavbar(true);
        loadInitialView();
    } else {
        showView('#login-view');
    }

    // --- VIEW MANAGEMENT ---
    function showView(viewId) {
        $('.main-view').hide();
        $(viewId).show();
    }

    function loadInitialView() {
        const role = localStorage.getItem('role');
        if (role === 'Admin') {
            showView('#admin-dashboard-view');
            loadAdminDashboard();
        } else {
            showView('#employee-dashboard-view');
            loadEmployeeDashboard();
        }
    }
    
    function updateNavbar(isLoggedIn) {
        if (isLoggedIn) {
            const name = localStorage.getItem('name') || 'User';
            $('#welcome-message').text(`Welcome, ${name}`);
            $('#user-info, #logout-btn').show();
        } else {
            $('#user-info, #logout-btn').hide();
        }
    }
    
    // --- UTILITIES ---
    function showNotification(message, isError = false) {
        const toastId = 'toast-' + new Date().getTime();
        const toastHTML = `
            <div id="${toastId}" class="toast align-items-center text-white ${isError ? 'bg-danger' : 'bg-success'}" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">${message}</div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>`;
        $('#notification').append(toastHTML);
        const toastElement = new bootstrap.Toast(document.getElementById(toastId));
        toastElement.show();
         setTimeout(() => $(`#${toastId}`).remove(), 5000);
    }
    
    // FIX: Made this function more robust to handle different error formats
    function handleApiError(jqXHR, defaultMessage) {
        let message = defaultMessage;
        if (jqXHR.responseJSON) {
            const response = jqXHR.responseJSON;
            // Handle ASP.NET Core validation errors (which have an 'errors' property)
            if (response.errors && typeof response.errors === 'object') {
                message = Object.values(response.errors).flat().join(' ');
            } 
            // Handle other standard ASP.NET Core error formats
            else if (response.title) {
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
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
    }

    // --- AUTHENTICATION ---
    $('#login-form').on('submit', function(e) {
        e.preventDefault();
        if (this.checkValidity() === false) {
            $(this).addClass('was-validated');
            return;
        }
        const email = $('#login-email').val();
        const password = $('#login-password').val();
        
        // FIX: Use the reliable apiCall helper function instead of $.post to avoid 415 error
        apiCall('/Auth/login', 'POST', { email, password })
            .done(function(data) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('role', data.role);
                localStorage.setItem('id', data.id);
                localStorage.setItem('name', 'User'); // Placeholder
                
                showNotification('Login successful!');
                updateNavbar(true);
                loadInitialView();
            })
            .fail(function(jqXHR) {
                handleApiError(jqXHR, 'Invalid email or password.');
            });
    });

    $('#register-form').on('submit', function(e) {
        e.preventDefault();
         if (this.checkValidity() === false) {
            $(this).addClass('was-validated');
            return;
        }
        const name = $('#register-name').val();
        const email = $('#register-email').val();
        const password = $('#register-password').val();
        const role = $('#register-role').val();

        apiCall('/Auth/register', 'POST', { name, email, password, role })
            .done(function() {
                showNotification('Registration successful! Please login.');
                // Switch to login tab
                $('.nav-tabs a[href="#login-tab"]').tab('show');
                $('#login-email').val(email);
            })
            .fail(function(jqXHR) {
                handleApiError(jqXHR, 'Registration failed. The email may already be in use.');
            });
    });
    
    $('#logout-btn').on('click', function() {
        localStorage.clear();
        updateNavbar(false);
        showView('#login-view');
        $('#login-form').removeClass('was-validated')[0].reset();
        $('#register-form').removeClass('was-validated')[0].reset();
        showNotification('You have been logged out.');
    });

    // --- EMPLOYEE DASHBOARD ---
    function loadEmployeeDashboard() {
        const employeeId = localStorage.getItem('id');
        apiCall(`/Timesheet/employee/${employeeId}`, 'GET')
            .done(function(timesheets) {
                renderTimesheetTable('#employee-timesheet-table-body', timesheets);
            })
            .fail(function(jqXHR) {
                handleApiError(jqXHR, 'Failed to load timesheets.');
            });
    }
    
    function renderTimesheetTable(tableBodyId, timesheets) {
        const $tbody = $(tableBodyId);
        $tbody.empty();
        if (!Array.isArray(timesheets)) timesheets = [timesheets]; // Handle single object response
        if (timesheets && timesheets.length > 0) {
             timesheets.forEach(ts => {
                const date = new Date(ts.date).toLocaleDateString();
                $tbody.append(`
                    <tr data-id="${ts.id}">
                        <td>${date}</td>
                        <td>${ts.hoursWorked}</td>
                        <td>${ts.taskDetails}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary edit-timesheet-btn" data-id="${ts.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger delete-timesheet-btn" data-id="${ts.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `);
            });
        } else {
            $tbody.append('<tr><td colspan="4" class="text-center">No timesheets found.</td></tr>');
        }
    }
    
    // --- ADMIN DASHBOARD ---
    function loadAdminDashboard() {
        apiCall('/Employee', 'GET')
            .done(function(employees) {
                // Store user name from here if possible for the welcome message
                const currentUserId = parseInt(localStorage.getItem('id'));
                const currentUser = employees.find(e => e.id === currentUserId);
                if (currentUser) {
                   localStorage.setItem('name', currentUser.name);
                   updateNavbar(true);
                }
                
                const $tbody = $('#admin-employee-table-body');
                $tbody.empty();
                employees.forEach(emp => {
                    $tbody.append(`
                        <tr data-id="${emp.id}">
                            <td>${emp.name}</td>
                            <td>${emp.email}</td>
                            <td>${emp.role}</td>
                            <td>
                                <button class="btn btn-sm btn-outline-danger delete-employee-btn" data-id="${emp.id}" data-name="${emp.name}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>`);
                });
            })
            .fail(function(jqXHR) {
                handleApiError(jqXHR, 'Failed to load employees.');
            });
    }
    
    // --- TIMESHEET MODAL & ACTIONS ---
    const timesheetModal = new bootstrap.Modal(document.getElementById('timesheet-modal'));
    
    $('#add-timesheet-btn').on('click', function() {
        $('#timesheet-form')[0].reset();
        $('#timesheet-form').removeClass('was-validated');
        $('#timesheet-modal-title').text('Add Timesheet');
        $('#timesheet-id').val('');
        timesheetModal.show();
    });
    
    $('body').on('click', '.edit-timesheet-btn', function() {
        const id = $(this).data('id');
         // The get by id endpoint is not available, so we'll get all and filter
        const employeeId = localStorage.getItem('id');
        apiCall(`/Timesheet/employee/${employeeId}`, 'GET')
            .done(function(timesheets) {
                 if (!Array.isArray(timesheets)) timesheets = [timesheets];
                 const timesheet = timesheets.find(ts => ts.id === id);
                 if(timesheet) {
                    $('#timesheet-form')[0].reset();
                    $('#timesheet-form').removeClass('was-validated');
                    $('#timesheet-modal-title').text('Edit Timesheet');
                    $('#timesheet-id').val(timesheet.id);
                    // Format date for input type="date" which requires YYYY-MM-DD
                    const date = new Date(timesheet.date).toISOString().split('T')[0];
                    $('#timesheet-date').val(date);
                    $('#timesheet-hours').val(timesheet.hoursWorked);
                    $('#timesheet-details').val(timesheet.taskDetails);
                    timesheetModal.show();
                 }
            });
    });

    $('#save-timesheet-btn').on('click', function() {
        const form = document.getElementById('timesheet-form');
        if (form.checkValidity() === false) {
            $(form).addClass('was-validated');
            return;
        }

        const id = $('#timesheet-id').val();
        const employeeId = parseInt(localStorage.getItem('id'));

        const timesheetData = {
            id: id ? parseInt(id) : 0,
            employeeId: employeeId,
            date: $('#timesheet-date').val(),
            hoursWorked: parseInt($('#timesheet-hours').val()),
            taskDetails: $('#timesheet-details').val()
        };

        const method = id ? 'PUT' : 'POST';
        const endpoint = id ? `/Timesheet/${id}` : '/Timesheet';
        
        apiCall(endpoint, method, timesheetData)
            .done(function() {
                showNotification(`Timesheet ${id ? 'updated' : 'added'} successfully.`);
                timesheetModal.hide();
                loadEmployeeDashboard();
            })
            .fail(function(jqXHR) {
                handleApiError(jqXHR, `Failed to ${id ? 'update' : 'add'} timesheet.`);
            });
    });
    
    // --- DELETE ACTIONS ---
    const deleteModal = new bootstrap.Modal(document.getElementById('confirm-delete-modal'));

    // Set up delete for timesheets
    $('body').on('click', '.delete-timesheet-btn', function() {
        const id = $(this).data('id');
        $('#delete-message').text('Are you sure you want to delete this timesheet entry?');
        deleteAction = function() {
            apiCall(`/Timesheet/${id}`, 'DELETE')
                .done(() => {
                    showNotification('Timesheet deleted successfully.');
                    loadEmployeeDashboard();
                })
                .fail((jqXHR) => handleApiError(jqXHR, 'Failed to delete timesheet.'));
        };
        deleteModal.show();
    });
    
    // Set up delete for employees (admin only)
     $('body').on('click', '.delete-employee-btn', function() {
        const id = $(this).data('id');
        const name = $(this).data('name');
         $('#delete-message').text(`Are you sure you want to delete the employee "${name}"? This action cannot be undone.`);
        deleteAction = function() {
            apiCall(`/Employee/${id}`, 'DELETE')
                .done(() => {
                    showNotification('Employee deleted successfully.');
                    loadAdminDashboard();
                })
                .fail((jqXHR) => handleApiError(jqXHR, 'Failed to delete employee.'));
        };
        deleteModal.show();
    });

    // Universal delete confirmation
    $('#confirm-delete-btn').on('click', function() {
        if (typeof deleteAction === 'function') {
            deleteAction();
        }
        deleteModal.hide();
        deleteAction = null;
    });
});

