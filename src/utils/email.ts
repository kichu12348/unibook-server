import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false, 
  auth: {
    user: process.env.SMTP_USER, 
    pass: process.env.SMTP_PASS, 
  },
});

export async function sendOtpEmail(userEmail: string, otp: string) {
  const mailOptions = {
    from: `"Unibook" <${process.env.EMAIL_FROM}>`,
    to: userEmail,
    subject: "Your Unibook Verification Code",
    html: `
      <div style="background-color: #ffffff; color: #000000; font-family: Arial, sans-serif; padding: 20px; text-align: center;">
        <h2 style="color: #000000;">Your Verification Code</h2>
        <p style="color: #333333;">Please use the following code to complete your registration.</p>
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 20px 0; color: #000000;">
          ${otp}
        </div>
        <p style="color: #555555; font-size: 12px;">This code will expire in 10 minutes.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Successfully sent OTP email to ${userEmail}`);
  } catch (error) {
    console.error("Failed to send OTP email:", error);
  }
}


// const test = async () => {
//   await sendOtpEmail("chn23cse026@ceconline.edu", "123456");
// }
// test().then(()=>console.log("Test email sent")).catch(err => console.error("Error sending test email:", err));