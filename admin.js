$(document).ready(function () {
    // --- Google Apps Script Config ---
    const API_URL = "My_API_URL";

    function checkAuth() {
        const isLoggedIn = sessionStorage.getItem('adminLoggedIn') === 'true';
        if (isLoggedIn) {
            $('#loginOverlay').hide();
            $('#adminHeader').show();
            $('#adminMain').css('display', 'grid');
            return true;
        } else {
            $('#loginOverlay').show();
            $('#adminHeader').hide();
            $('#adminMain').hide();
            return false;
        }
    }

    // Security: if somebody try to open admin page without login it will redirect to login page
    setInterval(() => {
        if (sessionStorage.getItem('adminLoggedIn') !== 'true' && $('#adminMain').is(':visible')) {
            window.location.reload();
        }
    }, 1000);

    if (checkAuth()) {
        loadAllDataFromAPI();
    }

    $('#loginSubmit').click(function () {
        const u = $('#adminUser').val();
        const p = $('#adminPass').val();
        const submitBtn = $(this);

        if (!u || !p) {
            Swal.fire({ icon: 'warning', title: 'Empty Fields', text: 'Please enter both username and password.' });
            return;
        }

        submitBtn.html('<i class="fa-solid fa-spinner fa-spin"></i> Checking...').prop('disabled', true);

        // API Call with cache buster to prevent cached wrong results
        const loginUrl = `${API_URL}?action=login&user=${encodeURIComponent(u)}&pass=${encodeURIComponent(p)}&t=${Date.now()}`;

        fetch(loginUrl)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    sessionStorage.setItem('adminLoggedIn', 'true');
                    sessionStorage.setItem('adminAuth', p); // Save password for API calls
                    $('#loginOverlay').fadeOut();
                    $('#adminHeader').fadeIn();
                    $('#adminMain').fadeIn().css('display', 'grid');
                    loadAllDataFromAPI();
                } else {
                    $('#loginError').text('Invalid Username or Password!').show();
                    setTimeout(() => $('#loginError').fadeOut(), 3000);
                }
            })
            .catch(err => {
                console.error("Login Error:", err);
                Swal.fire({
                    icon: 'error',
                    title: 'Connection Error',
                    text: 'Unable to reach the login server. Please ensure you have deployed the script as "Anyone" and check your internet.'
                });
            })
            .finally(() => {
                submitBtn.text('Login').prop('disabled', false);
            });
    });

    // --- Data Management (API Sync) ---
    let dbProducts = [];
    let dbCategories = [];
    let currentFilter = 'all';
    let searchQuery = '';

    function loadAllDataFromAPI() {
        $('#adminLoader').fadeIn(200);
        const cacheBuster = API_URL.includes('?') ? '&t=' : '?t=';
        fetch(API_URL + cacheBuster + Date.now())
            .then(response => response.json())
            .then(data => {
                const productsData = data.products || [];
                dbProducts = productsData.map(p => ({
                    id: p.id,
                    image: p.product_image,
                    nameEn: p.p_name_en,
                    nameHi: p.p_name_hi,
                    price: parseFloat(p.price),
                    unit: p.unit,
                    categorySlug: (p.category || 'others').toLowerCase(),
                    visible: p.status === "visible",
                    inStock: p.stock === "in_stock"
                }));

                const categoriesData = data.categories || [];

                if (categoriesData.length > 0) {
                    dbCategories = categoriesData.map(c => ({
                        id: c.id,
                        name: c.name,
                        slug: (c.slug || '').toLowerCase(),
                        type: c.type || 'image',
                        value: c.value,
                        status: c.status || 'visible'
                    }));
                } else {
                    const catMap = new Set(Object.keys(availableImages));
                    $.each(dbProducts, function (i, p) { catMap.add(p.categorySlug); });
                    dbCategories = Array.from(catMap).map((slug, i) => ({
                        id: i + 1,
                        name: slug.charAt(0).toUpperCase() + slug.slice(1),
                        slug: slug,
                        type: "image",
                        value: `category_image/cat_${slug}.png`
                    }));
                }

                renderEverything();
                $('#adminLoader').fadeOut(200);
            })
            .catch(err => {
                console.error("Fetch Error:", err);
                $('#adminLoader').fadeOut(200);
                Swal.fire({
                    icon: 'error',
                    title: 'Fetch Error',
                    text: 'API Error: Fetch failed. Check console for CORS issues.'
                });
            });
    }

    function callAPI(payload, callback) {
        $('#adminLoader').fadeIn(200);

        // Use saved password from session for secure actions
        const securePayload = {
            ...payload,
            auth: sessionStorage.getItem('adminAuth') || "NO_AUTH"
        };

        fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify(securePayload)
        }).then(() => {
            setTimeout(() => {
                if (callback) callback();
                loadAllDataFromAPI();
            }, 2000);
        }).catch(err => {
            console.error("API Error:", err);
            $('#adminLoader').fadeOut(200);
            Swal.fire({
                icon: 'error',
                title: 'API Error',
                text: 'Something went wrong while communicating with Google Sheets.'
            });
        });
    }

    function renderEverything() {
        updateCategoryDropdown();
        renderFilterBar();
        renderAdminProducts();
        renderAdminCategories();
        setupImagePickers();
    }

    // --- Product Actions ---
    function renderAdminProducts() {
        const list = $('#adminProductList').empty();
        let filtered = dbProducts;
        if (currentFilter !== 'all') filtered = filtered.filter(p => p.categorySlug === currentFilter);
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p => p.nameEn.toLowerCase().includes(q) || p.nameHi.includes(q));
        }

        $.each(filtered, function (i, p) {
            list.append(`
                <tr class="${p.visible ? '' : 'row-hidden'} ${p.inStock ? '' : 'low-stock'}">
                    <td><img src="${p.image}" width="40" height="40" style="object-fit:cover;border-radius:4px;" onerror="this.src='https://placehold.co/40x40?text=No+Img'"></td>
                    <td>
                        <div style="font-weight:600;">${p.nameEn}</div>
                        <div style="font-size:0.85rem;color:#666;">${p.nameHi}</div>
                    </td>
                    <td><span class="badge-category">${p.categorySlug}</span></td>
                    <td>₹${p.price}</td>
                    <td>${p.unit}</td>
                    <td>
                        <button class="status-toggle ${p.visible ? 'visible' : 'hidden'}" onclick="toggleStatus(${p.id}, 'visibility')">
                            <i class="fa-solid ${p.visible ? 'fa-eye' : 'fa-eye-slash'}"></i> ${p.visible ? 'Visible' : 'Hidden'}
                        </button>
                        <button class="status-toggle ${p.inStock ? 'instock' : 'outofstock'}" onclick="toggleStatus(${p.id}, 'stock')" style="margin-top:4px;">
                            <i class="fa-solid ${p.inStock ? 'fa-check' : 'fa-xmark'}"></i> ${p.inStock ? 'In Stock' : 'No Stock'}
                        </button>
                    </td>
                    <td class="actions">
                        <button class="btn-edit" onclick="editProduct(${p.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-delete" onclick="deleteProduct(${p.id})"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `);
        });
    }

    window.toggleStatus = function (id, type) {
        callAPI({ id: id, action: "toggle", type: type === 'stock' ? 'stock' : 'visibility' });
    };

    window.deleteProduct = function (id) {
        Swal.fire({
            title: 'Delete Product?',
            text: 'Are you sure you want to delete this product?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it!'
        }).then((result) => {
            if (result.isConfirmed) {
                callAPI({ id: id, action: "delete", target: "Products" });
            }
        });
    };

    window.toggleCategoryStatus = function (id) {
        callAPI({ id: id, action: "toggle", target: "Categories" });
    };

    $('#productForm').submit(function (e) {
        e.preventDefault();
        const id = $('#editProductId').val();
        const payload = {
            id: id === "-1" ? Date.now() : parseInt(id),
            action: id === "-1" ? "add" : "update",
            target: "Products",
            product_image: $('#pImage').val(),
            p_name_en: $('#pNameEn').val(),
            p_name_hi: $('#pNameHi').val(),
            price: $('#pPrice').val(),
            unit: $('#pUnit').val(),
            category: $('#pCategory').val()
        };
        callAPI(payload, () => closeModal('productModal'));
    });

    $('#categoryForm').submit(function (e) {
        e.preventDefault();
        const id = $('#editCategoryId').val();
        const payload = {
            id: id === "-1" ? Date.now() : parseInt(id),
            action: id === "-1" ? "add" : "update",
            target: "Categories",
            name: $('#cName').val(),
            slug: $('#cSlug').val(),
            type: $('#cType').val(),
            value: $('#cValue').val()
        };
        callAPI(payload, () => closeModal('categoryModal'));
    });

    window.editCategory = function (id) {
        const c = dbCategories.find(x => x.id == id);
        $('#editCategoryId').val(c.id);
        $('#cName').val(c.name);
        $('#cSlug').val(c.slug);
        $('#cType').val(c.type);
        $('#cValue').val(c.value);
        $('.picker-search').val(c.value);
        $('#categoryModalTitle').text('Edit Category');
        $('#categoryModal').fadeIn();
    };

    window.deleteCategory = function (id) {
        Swal.fire({
            title: 'Delete Category?',
            text: 'Deleting a category might affect products in that category. Continue?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it!'
        }).then((result) => {
            if (result.isConfirmed) {
                callAPI({ id: id, action: "delete", target: "Categories" });
            }
        });
    };

    // --- Search & Modals ---
    $('#adminProductSearch').on('input', function () { searchQuery = $(this).val(); renderAdminProducts(); });
    $('#addNewProduct').click(function () {
        $('#productForm')[0].reset();
        $('#editProductId').val('-1');
        $('#pImage').val('');
        $('.picker-search').val('');
        $('#productModalTitle').text('Add New Product');
        $('#productModal').fadeIn();
    });

    $('#addNewCategory').click(function () {
        $('#categoryForm')[0].reset();
        $('#editCategoryId').val('-1');
        $('#cValue').val('');
        $('.picker-search').val('');
        $('#categoryModalTitle').text('Add New Category');
        $('#categoryModal').fadeIn();
    });

    // Auto-generate slug from category name
    $('#cName').on('input', function () {
        const name = $(this).val();
        const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        $('#cSlug').val(slug);
    });

    // Update hidden input when image is selected in category picker
    $('#categoryValuePicker .picker-search').on('change input', function () {
        $('#cValue').val($(this).val());
    });

    window.editProduct = function (id) {
        const p = dbProducts.find(x => x.id === id);
        $('#editProductId').val(p.id);
        $('#pNameEn').val(p.nameEn);
        $('#pNameHi').val(p.nameHi);
        $('#pCategory').val(p.categorySlug);
        $('#pPrice').val(p.price);
        $('#pUnit').val(p.unit);
        $('#pImage').val(p.image);
        $('.picker-search').val(p.image);
        $('#productModalTitle').text('Edit Product');
        $('#productModal').fadeIn();
    };

    // --- Image Picker Logic ---
    // Custom paths remembered by the browser
    let rememberedImages = JSON.parse(localStorage.getItem('myShopRememberedImages')) || [];

    function saveToMemory(path) {
        if (!path || path.includes('placehold.co') || path.includes('https://')) return;
        if (!rememberedImages.includes(path)) {
            rememberedImages.push(path);
            localStorage.setItem('myShopRememberedImages', JSON.stringify(rememberedImages));
        }
    }

    const availableImages = {
        vegetables: ['beetroot.jpg', 'brinjal.jpg', 'cabbage.jpg', 'carrot.jpg', 'cauliflower.jpg', 'corn.jpg', 'cucumber.jpg', 'garlic.jpg', 'ginger.jpg', 'green_beans.jpg', 'green_chilli.jpg', 'green_coriander.jpg', 'lemon.jpg', 'onion.jpg', 'potato.jpg', 'radish.jpg', 'sweet_potato.jpg', 'tomato.jpg'],
        fruits: ['apple.jpg', 'banana.jpg', 'grapes.jpg', 'green_mango.jpg', 'guava.jpg', 'litchi.jpg', 'melon.jpg', 'orange.jpg', 'papaya.jpg', 'pineapple.jpg', 'pomegranate.jpg', 'watermelon.jpg', 'yello_mango.jpg'],
        dryfruits: ['almonds.jpg', 'cashew.jpg', 'dates.jpg', 'peanuts.jpg', 'raisins.jpg', 'walnuts.jpg'],
        spices: ['black_pepper.jpg', 'cardamom.jpg', 'cinnamon_stick.jpg', 'cloves.jpg', 'cumin_seeds.jpg'],
        grains: ['arahr_daal.jpg', 'basmati_rice.jpg', 'chana_daal.jpg', 'Gram_flour.jpg', 'maida.jpg', 'mung_daal.jpg', 'rajma.jpg', 'red_lentils.jpg', 'rice.jpg', 'whole_wheat_flour.jpg'],
        grocery: [],
        stationary: []
    };

    function setupImagePickers() {
        $('.picker-search').on('focus', function () {
            $(this).parent().next('.picker-dropdown').fadeIn();
            updateImageList($(this));
        });
        $('.picker-search').on('input', function () { updateImageList($(this)); });
        $(document).on('click', '.image-item', function () {
            const path = $(this).data('path');
            const isManual = $(this).hasClass('manual-path');
            const picker = $(this).closest('.image-picker-container');

            picker.find('.picker-search').val(path);
            picker.find('input[type="hidden"]').val(path);

            if (isManual) saveToMemory(path);

            $('.picker-dropdown').fadeOut();
        });

        // Add Enter key support for quick selection
        $('.picker-search').on('keydown', function (e) {
            if (e.which === 13) { // Enter
                const firstItem = $(this).parent().next('.picker-dropdown').find('.image-item').first();
                if (firstItem.length) firstItem.click();
            }
        });
    }

    function updateImageList(input) {
        const query = input.val().toLowerCase();
        const dropdown = input.parent().next('.picker-dropdown');
        const list = dropdown.find('.image-list');

        // Inject loader if not present
        if (dropdown.find('.picker-loader').length === 0) {
            dropdown.prepend(`
                <div class="picker-loader" style="display: none;">
                    <div class="mini-spinner"></div>
                    <span>Loading...</span>
                </div>
            `);
        }

        const loader = dropdown.find('.picker-loader');
        const isCategoryPicker = input.closest('#categoryModal').length > 0;
        const selectedCat = $('#pCategory').val() || 'vegetables';

        // Show loader and hide list briefly for visual feedback
        list.hide();
        loader.show();

        setTimeout(() => {
            list.empty();
            let allPaths = [];

            // 1. Add Hardcoded images
            if (isCategoryPicker) {
                const catImages = ['cat_dryfruits.png', 'cat_fruits.png', 'cat_furniture.jpg', 'cat_grains.jpg', 'cat_grocery.png', 'cat_spices.jpg', 'cat_vegetables.png'];
                $.each(catImages, function (i, img) { allPaths.push(`category_image/${img}`); });

                // Add remembered category images
                $.each(rememberedImages, function (i, path) {
                    if (path.startsWith('category_image/') && !allPaths.includes(path)) allPaths.push(path);
                });

                // --- AUTO-DISCOVERY: Get paths from existing categories ---
                $.each(dbCategories, function (i, cat) {
                    if (cat.type === 'image' && cat.value && !allPaths.includes(cat.value)) {
                        allPaths.push(cat.value);
                    }
                });
            } else {
                $.each(Object.keys(availableImages), function (i, cat) {
                    $.each(availableImages[cat], function (j, img) {
                        allPaths.push(`Product_Image/${cat}/${img}`);
                    });
                });

                // Add remembered product images
                $.each(rememberedImages, function (i, path) {
                    if (path.startsWith('Product_Image/') && !allPaths.includes(path)) allPaths.push(path);
                });

                // --- AUTO-DISCOVERY: Get paths from existing products ---
                $.each(dbProducts, function (i, prod) {
                    if (prod.image && !allPaths.includes(prod.image)) {
                        allPaths.push(prod.image);
                    }
                });

                allPaths.sort((a, b) => {
                    const aInCat = a.includes(selectedCat);
                    const bInCat = b.includes(selectedCat);
                    if (aInCat && !bInCat) return -1;
                    if (!aInCat && bInCat) return 1;
                    return 0;
                });
            }

            const filtered = allPaths.filter(p => p.toLowerCase().includes(query));

            $.each(filtered, function (i, path) {
                const isCatImg = path.startsWith('category_image/');
                const displayType = isCatImg ? 'category' : (path.split('/')[1] || 'product');

                list.append(`
                    <div class="image-item" data-path="${path}">
                        <img src="${path}" onerror="this.src='https://placehold.co/40?text=Error'">
                        <div class="image-item-info">
                            <span class="image-name">${path.split('/').pop()}</span>
                            <small class="image-type">${displayType}</small>
                        </div>
                    </div>
                `);
            });

            // Always offer manual path if it looks like a path and isn't already in the filtered list
            const isPath = query.includes('/') || query.includes('.');
            if (query && isPath && !allPaths.includes(query)) {
                list.append(`
                    <div class="image-item manual-path" data-path="${query}">
                        <img src="${query}" onerror="this.src='https://placehold.co/40?text=Wait...'">
                        <div class="image-item-info">
                            <span class="image-name">Use Manual: ${query.split('/').pop()}</span>
                            <small class="image-type">Click to remember & use this path</small>
                        </div>
                    </div>
                `);
            }

            loader.hide();
            list.fadeIn(200);
        }, 300); // Small 300ms delay for visual effect
    }

    window.closeModal = function (id) { $(`#${id}`).fadeOut(); };
    function updateCategoryDropdown() {
        const select = $('#pCategory').empty();
        $.each(dbCategories, function (i, c) { select.append(`<option value="${c.slug}">${c.name}</option>`); });
    }
    function renderFilterBar() {
        const bar = $('#adminCategoryFilter').empty();
        bar.append(`<div class="filter-item ${currentFilter === 'all' ? 'active' : ''}" data-slug="all">All Items</div>`);
        $.each(dbCategories, function (i, c) { bar.append(`<div class="filter-item ${currentFilter === c.slug ? 'active' : ''}" data-slug="${c.slug}">${c.name}</div>`); });
        $('.filter-item').click(function () {
            currentFilter = $(this).data('slug');
            $('.filter-item').removeClass('active'); $(this).addClass('active');
            renderAdminProducts();
        });
    }
    function renderAdminCategories() {
        const list = $('#adminCategoryList').empty();
        $.each(dbCategories, function (i, cat) {
            const isVisible = cat.status !== "hidden";
            const mediaHtml = cat.type === 'icon' ? `<i class="${cat.value}"></i>` : `<img src="${cat.value}" width="40" height="40" style="object-fit:cover;border-radius:4px;" onerror="this.src='https://placehold.co/40x40?text=Err'">`;
            list.append(`
                <tr class="${isVisible ? '' : 'row-hidden'}">
                    <td><div style="font-weight:600;">${cat.name}</div></td>
                    <td><span class="badge-category">${cat.slug}</span></td>
                    <td>${mediaHtml}</td>
                    <td>
                        <button class="status-toggle ${isVisible ? 'visible' : 'hidden'}" onclick="toggleCategoryStatus(${cat.id})">
                            <i class="fa-solid ${isVisible ? 'fa-eye' : 'fa-eye-slash'}"></i> ${isVisible ? 'Visible' : 'Hidden'}
                        </button>
                    </td>
                    <td class="actions">
                        <button class="btn-edit" onclick="editCategory(${cat.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-delete" onclick="deleteCategory(${cat.id})"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `);
        });
    }

    // --- Tab Switching ---
    $('.tab-btn').click(function () {
        $('.tab-btn').removeClass('active');
        $(this).addClass('active');
        const tab = $(this).data('tab');
        $('.tab-content').removeClass('active');
        $(`#${tab}`).addClass('active');

        if (tab === 'categories-tab') renderAdminCategories();
        else renderAdminProducts();
    });

    $(window).click(function (e) {
        if ($(e.target).hasClass('modal')) $('.modal').fadeOut();
        if (!$(e.target).closest('.image-picker-container').length) $('.picker-dropdown').fadeOut();
    });

    $('#logoutBtn').click(() => { sessionStorage.removeItem('adminLoggedIn'); window.location.href = 'index.html'; });

    if (sessionStorage.getItem('adminLoggedIn') === 'true') loadAllDataFromAPI();
});
