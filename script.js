$(document).ready(function () {
    let cart = JSON.parse(localStorage.getItem('myShopCart')) || [];
    let currentProducts = [];
    let currentCategories = [];
    let selectedCategory = 'all';
    let currentPage = 1;
    const itemsPerPage = 16;

    // --- Google Apps Script Config ---
    const API_URL = "My_API_URL";

    // --- Data Management (Google Sheets Sync) ---
    function loadShopData() {
        $('#homeLoader').fadeIn(200);
        if (!API_URL.includes("https")) {
            console.warn("Using LocalStorage fallback - URL not set.");
            const products = JSON.parse(localStorage.getItem('myShopProducts')) || [];
            processData(products);
            return;
        }

        fetch(API_URL)
            .then(response => response.json())
            .then(data => {
                processSheetsData(data.products || [], data.categories || []);
            })
            .catch(err => {
                console.error("API Error:", err);
                const products = JSON.parse(localStorage.getItem('myShopProducts')) || [];
                processData(products);
            });
    }

    function processSheetsData(products, categories) {
        const catMap = new Set();
        currentProducts = products.map((row, index) => ({
            id: row.id || index + 1,
            nameEn: row.p_name_en,
            nameHi: row.p_name_hi,
            category: (row.category || "others").toLowerCase(),
            price: parseFloat(row.price) || 0,
            unit: row.unit || "kg",
            image: row.product_image || "https://placehold.co/300x200?text=No+Image",
            visible: row.status !== "hidden",
            inStock: row.stock !== "out_of_stock"
        })).filter(p => p.visible !== false);

        if (categories.length > 0) {
            currentCategories = categories.map(c => ({
                id: c.id,
                name: c.name,
                slug: c.slug,
                type: c.type,
                value: c.value,
                visible: c.status !== "hidden"
            })).filter(c => c.visible);
        } else {
            // Auto fallback categories if sheet is empty
            $.each(currentProducts, function (i, p) { catMap.add(p.category); });
            currentCategories = Array.from(catMap).map((slug, i) => ({
                id: i + 1,
                name: slug.charAt(0).toUpperCase() + slug.slice(1),
                slug: slug,
                type: "image",
                value: `category_image/cat_${slug}.png`
            }));
        }

        renderCategories();
        renderFilteredProducts();
        updateCartUI();
        $('#homeLoader').fadeOut(500);
    }

    function processData(products) {
        currentProducts = products.filter(p => p.visible !== false);
        const cats = JSON.parse(localStorage.getItem('myShopCategories')) || [];
        currentCategories = cats;
        renderCategories();
        renderFilteredProducts();
        updateCartUI();
        $('#homeLoader').fadeOut(500);
    }

    // --- Render Functions ---
    function renderFilteredProducts() {
        const filtered = (selectedCategory === 'all'
            ? currentProducts
            : currentProducts.filter(p => p.category === selectedCategory))
            .filter(p => {
                const val = $('#searchInput').val() ? $('#searchInput').val().toLowerCase() : '';
                return p.nameEn.toLowerCase().includes(val) || p.nameHi.includes(val);
            });

        const totalPages = Math.ceil(filtered.length / itemsPerPage);
        if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;

        const startIndex = (currentPage - 1) * itemsPerPage;
        const pageProducts = filtered.slice(startIndex, startIndex + itemsPerPage);

        renderProducts(pageProducts, filtered.length);
    }

    function renderProducts(productList, totalFilteredCount = 0) {
        const grid = $('#productGrid');
        grid.empty();

        if (productList.length === 0) {
            grid.html('<p style="grid-column: 1/-1; text-align: center; font-size: 1.2rem;">No products found / कोई उत्पाद नहीं मिला</p>');
            return;
        }

        $.each(productList, function (i, product) {
            const cartItem = cart.find(item => item.id === product.id);
            let actionHtml = "";

            if (!product.inStock) {
                actionHtml = `<div class="out-of-stock-badge">Out of Stock / स्टॉक में नहीं है</div>`;
            } else {
                actionHtml = cartItem
                    ? `<div class="qty-controls"><button class="card-qty-btn minus" data-id="${product.id}">-</button><span>${cartItem.qty}</span><button class="card-qty-btn plus" data-id="${product.id}">+</button></div>`
                    : `<button class="add-btn" data-id="${product.id}"><i class="fa-solid fa-cart-plus"></i> Add to Cart</button>`;
            }

            grid.append(`
                <div class="product-card ${product.inStock ? '' : 'disabled'}" id="product-${product.id}">
                    <img src="${product.image}" alt="${product.nameEn}" onerror="this.src='https://placehold.co/300x200?text=Image+Coming+Soon'">
                    <h3>${product.nameEn}</h3>
                    <p class="hindi-name">${product.nameHi}</p>
                    <p class="price">₹${product.price} / ${product.unit}</p>
                    ${actionHtml}
                </div>
            `);
        });

        // Add Pagination Controls
        if (totalFilteredCount > itemsPerPage) {
            const totalPages = Math.ceil(totalFilteredCount / itemsPerPage);
            grid.append(`
                <div class="pagination-container">
                    <button class="pagination-btn" id="prevPage" ${currentPage === 1 ? 'disabled' : ''}>
                        <i class="fa-solid fa-chevron-left"></i> Previous
                    </button>
                    <span class="page-info">Page ${currentPage} of ${totalPages}</span>
                    <button class="pagination-btn" id="nextPage" ${currentPage === totalPages ? 'disabled' : ''}>
                        Next <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            `);

            $('#prevPage').click(function () {
                if (currentPage > 1) {
                    currentPage--;
                    renderFilteredProducts();
                    scrollToProducts();
                }
            });

            $('#nextPage').click(function () {
                if (currentPage < totalPages) {
                    currentPage++;
                    renderFilteredProducts();
                    scrollToProducts();
                }
            });
        }
    }

    function scrollToProducts() {
        $('html, body').animate({
            scrollTop: $("#products").offset().top - 100
        }, 500);
    }

    function renderCategories() {
        const categoriesContainer = $('.category-scroll-container');

        if (currentCategories.length > 0) {
            categoriesContainer.empty();
            categoriesContainer.append(`<div class="category-card ${selectedCategory === 'all' ? 'active' : ''}" data-category="all"><div><i class="fa-solid fa-border-all" style="font-size: 4rem; color: var(--primary-color);"></i></div><h3>All Items</h3></div>`);

            const sorted = [...currentCategories.filter(c => c.slug !== 'others'), ...currentCategories.filter(c => c.slug === 'others')];
            $.each(sorted, function (i, cat) {
                const mediaHtml = cat.type === 'icon' ? `<div><i class="${cat.value}" style="font-size: 4rem; color: var(--primary-color);"></i></div>` : `<img src="${cat.value}" alt="${cat.name}" onerror="this.src='https://placehold.co/100?text=${cat.name}'">`;
                categoriesContainer.append(`<div class="category-card ${selectedCategory === cat.slug ? 'active' : ''}" data-category="${cat.slug}">${mediaHtml}<h3>${cat.name}</h3></div>`);
            });

            $('.category-card').off('click').on('click', function () {
                $('.category-card').removeClass('active');
                $(this).addClass('active');
                selectedCategory = $(this).data('category');
                currentPage = 1; // Reset to page 1 on category change
                renderFilteredProducts();
            });
        }
    }

    // --- Cart Logic ---
    $(document).on('click', '.add-btn, .plus', function () {
        const id = $(this).data('id');
        const product = currentProducts.find(p => p.id === id);
        const item = cart.find(i => i.id === id);
        if (item) item.qty++; else cart.push({ ...product, qty: 1 });
        updateCart();
    });

    $(document).on('click', '.minus', function () {
        const id = $(this).data('id');
        const item = cart.find(i => i.id === id);
        if (item && item.qty > 1) item.qty--; else cart = cart.filter(i => i.id !== id);
        updateCart();
    });

    $(document).on('click', '.cart-delete-btn', function () {
        const id = $(this).data('id');
        cart = cart.filter(i => i.id !== id);
        updateCart();
    });

    function updateCart() {
        localStorage.setItem('myShopCart', JSON.stringify(cart));
        updateCartUI();
        renderFilteredProducts();
    }

    function updateCartUI() {
        const count = cart.reduce((total, item) => total + item.qty, 0);
        $('#cartCount').text(count);
        const list = $('#cartItems').empty();
        let total = 0;

        if (cart.length === 0) {
            list.html('<div class="empty-cart-msg">Your cart is empty</div>');
        } else {
            $.each(cart, function (i, item) {
                total += item.price * item.qty;
                list.append(`
                    <div class="cart-item">
                        <div class="cart-item-info">
                            <h4>${item.nameEn}${item.nameHi ? ` (${item.nameHi})` : ''}</h4>
                            <p>₹${item.price} x ${item.qty} ${item.unit}</p>
                        </div>
                        <div class="cart-item-actions">
                            <button class="qty-btn minus" data-id="${item.id}">-</button>
                            <span>${item.qty}</span>
                            <button class="qty-btn plus" data-id="${item.id}">+</button>
                            <button class="cart-delete-btn" data-id="${item.id}" title="Remove Item">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                `);
            });
        }
        $('#cartTotal').text('₹' + total);
    }

    // --- UI Interactions ---
    $('#cartBtn').click(() => { $('#cartModal').addClass('active'); $('#overlay').addClass('active'); $('#searchSuggestions').hide(); });
    $('#closeCart, #overlay').click(() => { $('#cartModal').removeClass('active'); $('#overlay').removeClass('active'); });

    // Slider
    let currentSlide = 0;
    function showSlide(index) {
        $('.slides').css('transform', `translateX(-${index * 25}%)`);
        $('.dot').removeClass('active').eq(index).addClass('active');
    }
    const sliderInterval = setInterval(() => { currentSlide = (currentSlide + 1) % 4; showSlide(currentSlide); }, 5000);

    // Search & Suggestions
    $('#searchInput').on('input', function () {
        const val = $(this).val().toLowerCase();
        const suggestionsBox = $('#searchSuggestions');

        if (val.length > 0) {
            const matches = currentProducts.filter(p => p.nameEn.toLowerCase().includes(val) || p.nameHi.includes(val)).slice(0, 5);

            if (matches.length > 0) {
                suggestionsBox.empty().show();
                $.each(matches, function (i, p) {
                    suggestionsBox.append(`
                        <div class="suggestion-item" data-id="${p.id}">
                            <img src="${p.image}" alt="${p.nameEn}">
                            <div class="suggestion-info">
                                <div class="name">${p.nameEn}</div>
                                <div class="price">₹${p.price} / ${p.unit}</div>
                            </div>
                        </div>
                    `);
                });
            } else {
                suggestionsBox.hide();
            }

            renderProducts(currentProducts.filter(p => p.nameEn.toLowerCase().includes(val) || p.nameHi.includes(val)));
        } else {
            suggestionsBox.hide();
            currentPage = 1; // Reset to page 1 on empty search
            renderFilteredProducts();
        }
    });

    $('#searchBtn').click(function () {
        const val = $('#searchInput').val().toLowerCase();
        if (val) {
            currentPage = 1; // Reset to page 1 for new search
            renderFilteredProducts();
            $('#searchSuggestions').hide();
            scrollToProducts();
        }
    });

    $(document).on('click', '.suggestion-item', function () {
        const id = $(this).data('id');
        const product = currentProducts.find(p => p.id === id);
        $('#searchInput').val(product.nameEn);
        $('#searchSuggestions').hide();
        renderProducts([product]);

        // Scroll to product
        $('html, body').animate({
            scrollTop: $("#products").offset().top - 100
        }, 500);
    });

    $(document).click(function (e) {
        if (!$(e.target).closest('.search-bar').length) {
            $('#searchSuggestions').hide();
        }
    });

    // Mobile Number Length Restriction
    $('#userPhone').on('input', function () {
        this.value = this.value.replace(/[^0-9]/g, ''); // Numbers only
        if (this.value.length > 10) {
            this.value = this.value.slice(0, 10); // Max 10 digits
        }
    });

    // Location Button
    $('#locationBtn').click(function () {
        if (navigator.geolocation) {
            $(this).html('<i class="fa-solid fa-spinner fa-spin"></i>');
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    $('#userAddress').val(`My Location: https://www.google.com/maps?q=${lat},${lon}\n` + $('#userAddress').val());
                    $(this).html('<i class="fa-solid fa-check" style="color: #2e7d32;"></i>');
                    setTimeout(() => {
                        $(this).html('<i class="fa-solid fa-location-crosshairs"></i>');
                    }, 3000);
                    Swal.fire({
                        icon: 'success',
                        title: 'Location Added',
                        text: 'Your current location has been added to the address field.',
                        timer: 2000,
                        showConfirmButton: false
                    });
                },
                (error) => {
                    $(this).html('<i class="fa-solid fa-location-crosshairs"></i>');
                    Swal.fire({
                        icon: 'error',
                        title: 'Location Error',
                        text: 'Unable to get your location. Please type it manually.'
                    });
                }
            );
        } else {
            Swal.fire({
                icon: 'warning',
                title: 'Not Supported',
                text: 'Geolocation is not supported by your browser.'
            });
        }
    });

    // Checkout
    $('#checkoutBtn').click(function () {
        if (cart.length === 0) {
            return Swal.fire({ icon: 'warning', title: 'Empty Cart', text: 'Your cart is empty!' });
        }

        const name = $('#userName').val().trim();
        const phone = $('#userPhone').val().trim();
        const address = $('#userAddress').val().trim();

        // Validations
        if (!name || name.length < 3) {
            return Swal.fire({ icon: 'error', title: 'Invalid Name', text: 'Please enter your full name (at least 3 characters).' });
        }

        const phoneRegex = /^[6-9]\d{9}$/;
        if (!phoneRegex.test(phone)) {
            return Swal.fire({ icon: 'error', title: 'Invalid Phone', text: 'Please enter a valid 10-digit mobile number.' });
        }

        if (!address || address.length < 10) {
            return Swal.fire({ icon: 'error', title: 'Invalid Address', text: 'Please enter a detailed address.' });
        }

        let msg = `*New Order from My Shop*\n\n*Name:* ${name}\n*Phone:* ${phone}\n*Address:* ${address}\n\n*Items:*\n`;
        $.each(cart, function (i, item) {
            const hindiPart = item.nameHi ? ` (${item.nameHi})` : '';
            msg += `- ${item.nameEn}${hindiPart}: ₹${item.price} x ${item.qty} ${item.unit}\n`;
        });
        msg += `\n*Total: ₹${cart.reduce((t, i) => t + (i.price * i.qty), 0)}*`;

        window.open(`https://wa.me/916393457594?text=${encodeURIComponent(msg)}`);

        // Clear Cart after order
        Swal.fire({
            icon: 'success',
            title: 'Order Placed!',
            text: 'Your order details have been sent via WhatsApp.',
            confirmButtonText: 'OK'
        }).then(() => {
            cart = [];
            localStorage.removeItem('myShopCart');
            updateCart();
            $('#userName').val('');
            $('#userPhone').val('');
            $('#userAddress').val('');
            $('#cartModal').removeClass('active');
            $('#overlay').removeClass('active');
        });
    });

    // Feedback
    $('#sendWhatsAppFeedback').click(function () {
        const text = $('#feedbackText').val().trim();
        if (!text) return Swal.fire({ icon: 'warning', title: 'Empty Feedback', text: 'Please write something first!' });

        const msg = `*Feedback from Website*\n\n${text}`;
        window.open(`https://wa.me/916393457594?text=${encodeURIComponent(msg)}`);

        $('#feedbackText').val('');
        Swal.fire({ icon: 'success', title: 'Thank You!', text: 'Your feedback has been sent via WhatsApp.' });
    });

    $('#sendEmailFeedback').click(function () {
        const text = $('#feedbackText').val().trim();
        if (!text) return Swal.fire({ icon: 'warning', title: 'Empty Feedback', text: 'Please write something first!' });

        const subject = encodeURIComponent("Website Feedback - My Shop");
        const body = encodeURIComponent(text);
        window.location.href = `mailto:lalitdubey8626@gmail.com?subject=${subject}&body=${body}`;

        $('#feedbackText').val('');
        Swal.fire({ icon: 'success', title: 'Thank You!', text: 'Your email client has been opened.' });
    });

    loadShopData();

    // --- Footer Year ---
    $('.footer-bottom p').html(`&copy; ${new Date().getFullYear()} My Shop. All rights reserved.`);
});
