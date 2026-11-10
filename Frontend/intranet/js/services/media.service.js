function buildImageUrl(id) {
    if (!id) return '';
    return `https://lh3.googleusercontent.com/d/${id.trim()}`;
}