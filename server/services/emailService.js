const sgMail = require("@sendgrid/mail");
const env = require("../config/env");

if (env.sendgridApiKey) {
  sgMail.setApiKey(env.sendgridApiKey);
}

function buildFrontendUrl(pathname) {
  const normalizedBase = env.frontendUrl.endsWith("/")
    ? env.frontendUrl.slice(0, -1)
    : env.frontendUrl;
  return `${normalizedBase}${pathname}`;
}

async function sendEmail({ toEmail, toName, subject, htmlContent }) {
  if (!env.isSendGridConfigured) {
    return false;
  }

  await sgMail.send({
    to: toName ? { email: toEmail, name: toName } : toEmail,
    from: {
      email: env.sendgridFromEmail,
      name: env.sendgridFromName,
    },
    subject,
    html: htmlContent,
  });

  return true;
}

async function sendSimpleEmail(toEmail, subject, content) {
  return sendEmail({
    toEmail,
    subject,
    htmlContent: content,
  });
}

async function sendHtmlEmail(toEmail, toName, subject, htmlContent) {
  return sendEmail({
    toEmail,
    toName,
    subject,
    htmlContent,
  });
}

async function sendVerificationEmail(toEmail, verificationLink) {
  const htmlContent = `
    <html><body>
      <h2>Xac minh Email cua Ban</h2>
      <p>Cam on ban da dang ky!</p>
      <p>Vui long nhap vao lien ket duoi day de xac minh email cua ban:</p>
      <a href="${verificationLink}">Xac minh Email</a>
      <p>${verificationLink}</p>
    </body></html>
  `;

  return sendSimpleEmail(toEmail, "Xac minh Email - Web Tuyen Online", htmlContent);
}

async function sendNotificationEmail(toEmail, title, message) {
  const htmlContent = `
    <html><body>
      <h2>${title}</h2>
      <p>${message}</p>
      <p>Web Tuyen Online</p>
    </body></html>
  `;

  return sendSimpleEmail(toEmail, title, htmlContent);
}

async function sendResetPasswordEmail(toEmail, resetToken) {
  const resetLink = buildFrontendUrl(`/reset-password?token=${resetToken}`);
  const htmlContent = `
    <html><body>
      <h2>Yeu cau Dat lai Mat khau</h2>
      <p>Ban da yeu cau dat lai mat khau cho tai khoan cua minh.</p>
      <p>Vui long su dung ma token hoac nhap vao lien ket duoi day de dat lai mat khau:</p>
      <h3>${resetToken}</h3>
      <a href="${resetLink}">Dat lai Mat khau</a>
      <p>Token co hieu luc trong 1 gio.</p>
    </body></html>
  `;

  return sendSimpleEmail(toEmail, "Dat lai Mat khau - Web Tuyen Online", htmlContent);
}

module.exports = {
  sendHtmlEmail,
  sendNotificationEmail,
  sendResetPasswordEmail,
  sendSimpleEmail,
  sendVerificationEmail,
};
