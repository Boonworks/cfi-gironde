<?php
declare(strict_types=1);
session_start();

$errors = [];
$success = false;

if (!isset($_SESSION['last_submit'])) $_SESSION['last_submit'] = 0;
if ($_SERVER['REQUEST_METHOD'] === 'POST') 
{
  	if (time() - $_SESSION['last_submit'] < 60) 
	{
    	$errors[] = "Trop d’envois, réessayez dans une minute.";
  	}
}

/* ========= PHPMailer (sans Composer) ========= */
require __DIR__ . '/phpmailer/Exception.php';
require __DIR__ . '/phpmailer/PHPMailer.php';
require __DIR__ . '/phpmailer/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;
/* ============================================= */

/* ================= CONFIG ==================== */
// Destinataire final
$MAIL_TO   = 'tbesson50@gmail.com';
$MAIL_TO2   = 'cfi-gironde@snsm.org';
$SITE_NAME = 'CFI Gironde';

$secrets = require '/home/config.mail.php';

$SMTP['pass'] = $secrets['smtp_pass'];
$RECAPTCHA_SECRET = $secrets['recaptcha_secret'];

// reCAPTCHA v3
$RECAPTCHA_SITE_KEY = '6Lf-H6UrAAAAANLq7Fcf8-ioLFBX_2MB8qP4O3ju';

$SMTP = [
  	'host'   => 'mail01.lwspanel.com',
  	'port'   => 587,
  	'secure' => 'tls',
  	'user'   => 'no-reply@cfi-gironde.fr',
  	'from'   => 'no-reply@cfi-gironde.fr', 
  	'pass'   => $secrets['smtp_pass'],
];

/* ============================================= */

if (empty($_SESSION['csrf'])) 
{
  	$_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function e(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function is_post(): bool { return ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST'; }

function verify_recaptcha(string $secret, string $token, string $remoteIp, float $minScore = 0.5): bool 
{
  	if ($token === 'no-captcha' || $token === '') return false;
  	$data = http_build_query(['secret'=>$secret,'response'=>$token,'remoteip'=>$remoteIp]);
  	$opts = ['http' => ['method'=>'POST','header'=>"Content-type: application/x-www-form-urlencoded\r\n",'content'=>$data,'timeout'=>5]];
  	$res  = @file_get_contents('https://www.google.com/recaptcha/api/siteverify', false, stream_context_create($opts));
  	if (!$res) return false;
  	$json = json_decode($res, true);
  	if (empty($json['success'])) return false;
  	if (isset($json['score']) && $json['score'] < $minScore) return false;
  	return true;
}

$errors = [];
$success = false;

if (is_post()) {
  	// Décaler un peu pour bots trop rapides
  	usleep(600000);

  	// CSRF
  	if (!isset($_POST['csrf']) || !hash_equals($_SESSION['csrf'], (string)$_POST['csrf'])) 
	{
  	 	$errors[] = "Session expirée. Merci de recharger la page.";
  	}

  	// Honeypot
  	if (!empty($_POST['website'] ?? '')) 
	{
  	  	// Bot → on fait comme si OK sans envoyer
  	  	$success = true;
  	} 
	else 
	{
  	  	// Données
  	  	$nom       = trim((string)($_POST['nom'] ?? ''));
  		$email     = trim((string)($_POST['email'] ?? ''));
  	  	$telephone = trim((string)($_POST['telephone'] ?? ''));
  	  	$motif     = trim((string)($_POST['motif'] ?? ''));
  	  	$message   = trim((string)($_POST['message'] ?? ''));
  	  	$token     = (string)($_POST['captcha_token'] ?? '');
  	  	$ip        = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

  	  	// Validations
  	  	if ($nom === '' || mb_strlen($nom) > 100)                       $errors[] = "Nom requis (max 100).";
  	  	if (!filter_var($email, FILTER_VALIDATE_EMAIL))                 $errors[] = "Adresse e-mail invalide.";
  	  	if (!preg_match('/^0[1-9](?:[ .-]?\d{2}){4}$/', $telephone))    $errors[] = "Téléphone invalide.";
  	  	if ($motif === '')                                              $errors[] = "Veuillez sélectionner un motif.";
  	  	if ($message === '' || mb_strlen($message) < 10)                $errors[] = "Message trop court (10 caractères min).";

  	  	// reCAPTCHA
  	  	if (!verify_recaptcha($RECAPTCHA_SECRET, $token, $ip, 0.5)) 
		{
  	  	  	$errors[] = "Vérification anti-spam échouée.";
  	  	}

    	// Envoi via SMTP/PHPMailer
    	if (!$errors) 
		{
      		$subject = "Contact site – $motif";
			// Version HTML
			$bodyHtml = "
			    <h2> Nouveau message depuis le merveilleux site web du cfi</h2>
			    <p><strong>Nom Prénom:</strong> " . htmlspecialchars($nom, ENT_QUOTES, 'UTF-8') . "</p>
			    <p><strong>Email :</strong> " . htmlspecialchars($email, ENT_QUOTES, 'UTF-8') . "</p>
			    <p><strong>Téléphone :</strong> " . htmlspecialchars($telephone, ENT_QUOTES, 'UTF-8') . "</p>
			    <p><strong>Motif :</strong> " . htmlspecialchars($motif, ENT_QUOTES, 'UTF-8') . "</p>
			    <p><strong>Message :</strong><br>" . nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8')) . "</p>
			    <hr>
			    <p><strong>IP :</strong> " . htmlspecialchars($ip, ENT_QUOTES, 'UTF-8') . "<br>
			    <strong>Date :</strong> " . date('Y-m-d H:i:s') . "</p>+


				<p>Mail rédigé automatiquement par Thomas, bisous :)<p>
			";

			// Version texte brut (fallback)
			$bodyText =
			    "Nouveau message depuis le site\n\n" .
			    "Nom : $nom\n" .
			    "Email : $email\n" .
			    "Téléphone : $telephone\n" .
			    "Motif : $motif\n" .
			    "Message :\n$message\n\n" .
			    "IP : $ip\n" .
			    "Date : " . date('Y-m-d H:i:s');

			
			try
			{
        		$mail = new PHPMailer(true);
        		$mail->CharSet   = 'UTF-8';
        		$mail->isSMTP();
        		$mail->Host      = $SMTP['host'];
        		$mail->Port      = (int)$SMTP['port'];
        		$mail->SMTPAuth  = true;
        		$mail->Username  = $SMTP['user'];
        		$mail->Password  = $SMTP['pass'];
        		if ($SMTP['secure'] === 'ssl') {
        		  	$mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        		} else {
        		  	$mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        		}

        		$mail->setFrom($SMTP['from'], $SITE_NAME);
        		// Destinataire (ta boîte)
        		$mail->addAddress($MAIL_TO);
				$mail->addAddress($MAIL_TO2); //cfi-gironde@snsm.org
        		// L’utilisateur en Reply-To
        		if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
        		  $mail->addReplyTo($email, $nom);
        		}

        		$mail->Subject = $subject;
        		$mail->Body    = $bodyHtml;
        		$mail->AltBody = $bodyText;
        		$mail->send();
					
        		try 
				{
        		    $ack = clone $mail;
        		    $ack->clearAddresses();
        		    $ack->clearReplyTos();
        		    $ack->addAddress($email, $nom);
        		    $ack->Subject = "CFI Gironde — Accusé de réception";
					$ack->isHTML(true); // On envoie en HTML pour gérer les sauts de ligne
					$ack->addEmbeddedImage('img/web/logo_cfi.png', 'logo_cfi');

    				//  Version HTML
    				$ack->isHTML(true);
    				$ack->Body = "
				        Bonjour $nom,<br><br>
				        Nous avons bien reçu votre message.<br>
				        Un membre de l'équipe vous répondra prochainement.<br><br>
				        — CFI Gironde <br>
						cfi-gironde@snsm.org<br>
						500 Boulevard Alfred Daney <br>
						33300 Bordeaux <br><br>

						<img src='cid:logo_cfi' style='max-width:100px;'>

				    ";

				    //  Version texte brut
				    $ack->AltBody = "Bonjour $nom,\n\n"
				        . "Nous avons bien reçu votre message.\n"
				        . "Un membre de l'équipe vous répondra prochainement.\n\n"
				        . "— CFI Gironde\n\n"
						. "cfi-gironde@snsm.org\n\n"
						. "500 Boulevard Alfred Daney\n\n"
						. "33300 Bordeaux\n\n"
						
					;

        		    $ack->send();
        		} catch (\Throwable $e) { /* on ignore si l’AR échoue */ }
			
        		$success = true;
        		$_SESSION['last_submit'] = time();
			
      		} catch (Exception $e) 
			{
        	$errors[] = 'Erreur SMTP: ' . $mail->ErrorInfo;
      		}
    	}
  	}
}
?>

<!DOCTYPE html>
<html lang="fr">
<head>
  	<meta charset="UTF-8">
  	<meta http-equiv="X-UA-Compatible" content="IE=edge">
  	<meta name="viewport" content="width=device-width, initial-scale=1.0">
  	<title>Contact – CFI Gironde – Formations BNSSA, PSE, PSC à Bordeaux</title>
  	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" integrity="sha512-1ycn6IcaQQ40/MKBW2W4Rhis/DbILU74C1vSrLJxCq57o941Ym01SwNsOMqvEBFlcgUa6xLiPY/NS5R+E6ztJQ==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  	<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  	<link href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Roboto:wght@300;400&display=swap" rel="stylesheet">
  	<link href="https://unpkg.com/aos@2.3.1/dist/aos.css" rel="stylesheet">
  	<link rel="stylesheet" href="style.css"/>
  	<link rel="canonical" href="https://cfi-gironde.fr/contact">
  	<link rel="icon" href="/img/web/logo.png" type="image/png">
  	<link rel="shortcut icon" href="/img/web/favicon.ico" type="image/x-icon">
  	<meta name="theme-color" content="#0a2a43">
  	<meta name="background-color" content="#ccc">
  	<meta name="apple-mobile-web-app-capable" content="yes">
  	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  	<meta name="apple-mobile-web-app-title" content="CFI Gironde">
  	<link rel="apple-touch-icon" href="/img/web/apple-icon.png" sizes="180x180">

  	<!-- reCAPTCHA v3 -->
  <script src="https://www.google.com/recaptcha/api.js?render=<?php echo e($RECAPTCHA_SITE_KEY); ?>"></script>

</head>
<body>
  	<section class="accueil">
    	<div class="overlay">
      		<div class="logo">
        		<a href="https://monespace.snsm.org/s/login/?ec=302&startURL=%2Fs%2F" target="_blank">
          		<img src="img/web/logo.png" alt="logo" />
        		</a>
      		</div>

      		<ul class="menu">
        		<li><a href="index.html" class="menu__link">Accueil</a></li>
        		<li class="has-submenu">
          		<a href="#" class="menu__link submenu-toggle">Formation</a>
          		<ul class="submenu">
            		<li><a href="formation-nageur-sauveteur.html" class="menu__link">Devenir Nageur Sauveteur</a></li>
            		<li><a href="formation-pse.html" class="menu__link">Filière professionelle - PSE</a></li>
            		<li><a href="formation-psc.html" class="menu__link">Filière citoyenne - PSC</a></li>
          		</ul>
        		</li>
        		<li><a href="calendrier.html" class="menu__link">Calendrier</a></li>
        		<li><a href="contact.php" class="menu__link">Contact</a></li>
        		<li><a href="photos.html" class="menu__link">Album</a></li>
      		</ul>

      		<div class="toggle">
      		  	<i class="fas fa-bars ouvrir"></i>
      		  	<i class="fas fa-times fermer"></i>
      		</div>

      		<div class="accueil__text">
        		<div class="accueil__text__top">
        	  		<div class="sep"></div>
        	  		<p>Centre de formation et d'intervention de Gironde</p>
        		</div>
        		<div class="accueil__text__mid">
        	  		<h1>Contact</h1>
        		</div>
      		</div>
    	</div>
	</section>

  	<!-- Messages retour -->
  	<?php if ($success && !$errors): ?>
    <div style="max-width:900px;margin:1rem auto;padding:1rem;border-radius:10px;background:#e8fff0;border:1px solid #b7f0c5;color:#134e22">
      	Merci, votre message a bien été envoyé.
    </div>
  	<?php endif; ?>
  	<?php if ($errors): ?>
    <div style="max-width:900px;margin:1rem auto;padding:1rem;border-radius:10px;background:#ffecec;border:1px solid #ffb6b6;color:#7a1717">
      	<strong>Impossible d’envoyer :</strong>
      	<ul><?php foreach ($errors as $er) echo '<li>'.e($er).'</li>'; ?></ul>
    </div>
  	<?php endif; ?>

  	<!-- SECTION PRINCIPALE -->
  	<section class="section-contact">
    	<div class="contact-container">
      		<div class="contact-info" data-aos="zoom-in" data-aos-delay="100">
        		<div class="entete__titre">
          			<h2>Contact</h2>
          			<div class="barre"></div>
          			<p style="padding-bottom: 10px; padding-left: 10px;"><strong>Mail :</strong></p>
          			<a href="mailto:cfi-gironde@snsm.org" class="lien-special">cfi-gironde@snsm.org</a>
          			<p style="padding-top: 10px; padding-bottom: 10px; padding-left: 10px"><strong>Instagram :</strong></p>
          			<a href="https://www.instagram.com/cfi_gironde_snsm?igsh=MWJtZW82Z2Ntdm5meA==" target="_blank"  class="lien-special">@cfi_gironde_snsm</a>
          			<br><br>
          			<p><strong>500 Boulevard Alfred Daney </strong></p>
          			<p><strong>33300 Bordeaux</strong></p>

          			<div class="google-map" style="margin-top:1rem;">
            			<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2848.278013777135!2d-0.5582617844736781!3d44.86810727909847!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xd5528bb6c567d2f%3A0x5267ddc2b7d8f2bb!2s500%20Bd%20Alfred%20Daney%2C%2033300%20Bordeaux!5e0!3m2!1sfr!2sfr!4v1690217766661!5m2!1sfr!2sfr"
              			width="100%" height="350" style="border:0;border-radius:10px;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
          			</div>
        		</div>
      		</div>

      		<!-- Formulaire -->
      		<div class="contact-form" data-aos="fade-up" data-aos-delay="100">
        		<form action="" method="post" id="contactForm">
          			<input type="hidden" name="csrf" value="<?php echo e($_SESSION['csrf']); ?>">
          			<input type="hidden" name="captcha_token" id="captcha_token">

          			<div class="form-group">
            			<label for="nom">Nom Prénom</label>
            			<input type="text" id="nom" name="nom" required value="<?php echo e($_POST['nom'] ?? ''); ?>">
          			</div>

          			<div class="form-group">
            			<label for="email">Adresse e-mail</label>
            			<input type="email" id="email" name="email" required value="<?php echo e($_POST['email'] ?? ''); ?>">
          			</div>

          			<div class="form-group">
            			<label for="telephone">Numéro de téléphone</label>
            			<input type="tel" id="telephone" name="telephone" pattern="[0-9]{10}" required value="<?php echo e($_POST['telephone'] ?? ''); ?>">
          			</div>

          			<div class="form-group">
            			<label for="motif">Motif du message</label>
            			<select id="motif" name="motif" required>
              				<option value="" disabled <?php echo empty($_POST['motif']) ? 'selected' : ''; ?>>-- Sélectionner un motif --</option>
              				<option value="Formation de Nageur Sauveteur" <?php echo (($_POST['motif'] ?? '')==='Formation de Nageur Sauveteur')?'selected':''; ?>>Formation de nageur sauveteur</option>
              				<option value="Formation PSE" <?php echo (($_POST['motif'] ?? '')==='Formation PSE')?'selected':''; ?>>Formation PSE1&2</option>
              				<option value="Formation PSC" <?php echo (($_POST['motif'] ?? '')==='Formation PSC')?'selected':''; ?>>Formation PSC</option>
              				<option value="Autre" <?php echo (($_POST['motif'] ?? '')==='Autre')?'selected':''; ?>>Autre</option>
            			</select>
          			</div>

          			<div class="form-group">
            			<label for="message">Message</label>
            			<textarea id="message" name="message" rows="5" required><?php echo e($_POST['message'] ?? ''); ?></textarea>
          			</div>

          			<!-- Honeypot -->
          			<div style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;">
            			<label for="website">Website</label>
            			<input type="text" id="website" name="website" tabindex="-1" autocomplete="off">
          			</div>

           			<div class="form-group consent">
        				<label for="consent">
            				J’accepte que mes données soient utilisées pour être recontacté.
            				<span class="privacy-right">
                				<a href="/mentions.html#confidentialite" class="lien-special" target="_blank" rel="noopener">Politique de confidentialité</a>
            				</span>
        				</label>
    				</div>

          			<button type="submit">Envoyer</button>
        		</form>
      		</div>
    	</div>
  	</section>

  	<!-- FOOTER -->
  	<section class="contact">
    	<div class="footer-bottom">
      		<img src="img/web/logo.png">
      		<a href="index.html">&copy; 2025 SNSM GIRONDE</a>
      		<a href="https://www.instagram.com/cfi_gironde_snsm?igsh=MWJtZW82Z2Ntdm5meA==" target="_blank" aria-label="Instagram">
        		<img src="img/web/insta.png" alt="Instagram">
      		</a>
    	</div>
    	<div class="footer">
      		<a href="mentions.html">Mentions légales</a>
    	</div>
  	</section>

  	<script src="https://unpkg.com/aos@2.3.1/dist/aos.js"></script>
  	<script> AOS.init(); </script>
  	<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.7.1/gsap.min.js" integrity="sha512-UxP+UhJaGRWuMG2YC6LPWYpFQnsSgnor0VUF3BHdD83PS/pOpN+FYbZmrYN+ISX8jnvgVUciqP/fILOXDjZSwg==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  	<script src="app.js"></script>

  	<!-- Génération du token reCAPTCHA v3 au submit -->
  	<script>
    	const siteKey = "<?php echo e($RECAPTCHA_SITE_KEY); ?>";
    	const form = document.getElementById('contactForm');
    	form.addEventListener('submit', function (e) 
		{
      		const tokenField = document.getElementById('captcha_token');
      		if (!tokenField.value) 
			{
        		e.preventDefault();
        		grecaptcha.ready(async function () 
				{
          			try 
					{
            			const token = await grecaptcha.execute(siteKey, { action: 'contact' });
            			tokenField.value = token;
            			form.submit();
          			} catch (err) 
					{
            			alert("Erreur reCAPTCHA, merci de réessayer.");
          			}
        		});
      		}
    	});
  	</script>
</body>
</html>
