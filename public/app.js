document.addEventListener('DOMContentLoaded', () => {
    const articlesGrid = document.getElementById('articles-grid');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const downloadBtn = document.getElementById('download-btn');
    const searchInput = document.getElementById('search-input');
    const feedFilter = document.getElementById('feed-filter');
    const paginationEl = document.getElementById('pagination');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const pageInfo = document.getElementById('page-info');

    let articles = [];
    const selectedArticleIds = new Set();

    let currentPage = 1;
    const pageSize = 9;
    let searchQuery = '';
    let selectedFeed = '';

    async function fetchFeeds() {
        try {
            const response = await fetch('/api/feeds');
            if (!response.ok) {
                throw new Error('Failed to fetch feeds');
            }
            const data = await response.json();
            articles = data.articles;
            populateFilters();
            renderArticles();
        } catch (err) {
            showError('Could not load feeds. ' + err.message);
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    function populateFilters() {
        const feeds = new Set();
        articles.forEach(article => {
            if (article.feedTitle) {
                feeds.add(article.feedTitle);
            }
        });
        feedFilter.innerHTML = '<option value="">All Publications</option>';
        Array.from(feeds).sort().forEach(feed => {
            const option = document.createElement('option');
            option.value = feed;
            option.textContent = feed;
            feedFilter.appendChild(option);
        });
    }

    function getFilteredArticles() {
        return articles.filter(article => {
            const matchesSearch = searchQuery === '' ||
                (article.title && article.title.toLowerCase().includes(searchQuery)) ||
                (article.contentSnippet && article.contentSnippet.toLowerCase().includes(searchQuery));
            const matchesFeed = selectedFeed === '' || article.feedTitle === selectedFeed;
            return matchesSearch && matchesFeed;
        });
    }

    function renderArticles() {
        articlesGrid.innerHTML = '';
        const filtered = getFilteredArticles();
        const totalItems = filtered.length;
        const totalPages = Math.ceil(totalItems / pageSize) || 1;

        if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        if (totalItems === 0) {
            articlesGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary);">No articles found.</div>';
            paginationEl.classList.add('hidden');
            return;
        }

        paginationEl.classList.remove('hidden');
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages;

        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const pageArticles = filtered.slice(startIndex, endIndex);

        pageArticles.forEach(article => {
            const card = document.createElement('div');
            card.className = 'article-card';
            card.dataset.id = article.id;
            if (selectedArticleIds.has(article.id)) {
                card.classList.add('selected');
            }

            const date = new Date(article.pubDate).toLocaleDateString();

            card.innerHTML = `
                <div class="article-meta">
                    <span>${article.feedTitle || 'Feed'}</span>
                    <span>${date !== 'Invalid Date' ? date : ''}</span>
                </div>
                <h2 class="article-title">${article.title}</h2>
                <div class="article-summary">${stripHtml(article.contentSnippet || 'No summary available.')}</div>
                <div class="article-footer">
                    <a href="${article.link}" target="_blank" class="article-link" onclick="event.stopPropagation()">Read Original</a>
                    <div class="checkbox-wrapper">
                        <input type="checkbox" id="check-${article.id}" ${selectedArticleIds.has(article.id) ? 'checked' : ''}>
                    </div>
                </div>
            `;

            card.addEventListener('click', () => toggleSelection(article.id, card));
            const checkbox = card.querySelector('input');
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                if (e.target.checked) {
                    selectArticle(article.id, card);
                } else {
                    deselectArticle(article.id, card);
                }
            });

            articlesGrid.appendChild(card);
        });
    }

    function stripHtml(html) {
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    function toggleSelection(id, card) {
        if (selectedArticleIds.has(id)) {
            deselectArticle(id, card);
        } else {
            selectArticle(id, card);
        }
    }

    function selectArticle(id, card) {
        selectedArticleIds.add(id);
        card.classList.add('selected');
        card.querySelector('input').checked = true;
        updateDownloadButton();
    }

    function deselectArticle(id, card) {
        selectedArticleIds.delete(id);
        card.classList.remove('selected');
        card.querySelector('input').checked = false;
        updateDownloadButton();
    }

    function updateDownloadButton() {
        downloadBtn.disabled = selectedArticleIds.size === 0;
        downloadBtn.textContent = selectedArticleIds.size > 0
            ? `Send to Kindle (${selectedArticleIds.size})`
            : 'Send to Kindle';
    }

    function showError(message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        setTimeout(() => errorEl.classList.add('hidden'), 5000);
    }

    downloadBtn.addEventListener('click', async () => {
        if (selectedArticleIds.size === 0) return;

        const originalText = downloadBtn.textContent;
        downloadBtn.textContent = 'Sending...';
        downloadBtn.disabled = true;

        try {
            const response = await fetch('/api/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ articleIds: Array.from(selectedArticleIds) })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send to Kindle');
            }

            alert('Successfully sent to Kindle!');
            selectedArticleIds.clear();
            renderArticles();
            updateDownloadButton();
        } catch (err) {
            showError(err.message);
            downloadBtn.disabled = false;
            downloadBtn.textContent = originalText;
        }
    });

    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        currentPage = 1;
        renderArticles();
    });

    feedFilter.addEventListener('change', (e) => {
        selectedFeed = e.target.value;
        currentPage = 1;
        renderArticles();
    });

    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderArticles();
        }
    });

    nextBtn.addEventListener('click', () => {
        const filtered = getFilteredArticles();
        const totalPages = Math.ceil(filtered.length / pageSize) || 1;
        if (currentPage < totalPages) {
            currentPage++;
            renderArticles();
        }
    });

    fetchFeeds();
});
