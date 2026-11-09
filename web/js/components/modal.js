// web/js/components/modal.js
// In-page accessible modal & confirmation dialogs (Zero window.confirm).

export function showModal({ title, contentHtml, onRender = null, onClose = null }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  backdrop.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="btn-icon close-btn" aria-label="Close dialog">&times;</button>
      </div>
      <div class="modal-body">
        ${contentHtml}
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const closeBtn = backdrop.querySelector('.close-btn');
  const close = () => {
    document.removeEventListener('keydown', handleKey);
    if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    if (onClose) onClose();
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') close();
  };

  document.addEventListener('keydown', handleKey);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  if (onRender) {
    onRender(backdrop, close);
  }

  return { close };
}

export function confirmDialog({
  title = 'Please Confirm',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false
}) {
  return new Promise((resolve) => {
    const content = `
      <p style="font-size: 13px; color: var(--text-muted); margin-bottom: var(--space-4);">${message}</p>
      <div style="display: flex; justify-content: flex-end; gap: var(--space-2);">
        <button class="btn btn-secondary cancel-action">${cancelText}</button>
        <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'} confirm-action">${confirmText}</button>
      </div>
    `;

    showModal({
      title,
      contentHtml: content,
      onRender: (backdrop, close) => {
        const confirmBtn = backdrop.querySelector('.confirm-action');
        const cancelBtn = backdrop.querySelector('.cancel-action');

        confirmBtn.focus();

        confirmBtn.addEventListener('click', () => {
          close();
          resolve(true);
        });

        cancelBtn.addEventListener('click', () => {
          close();
          resolve(false);
        });
      },
      onClose: () => resolve(false)
    });
  });
}
