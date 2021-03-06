import User from "../models/User";
import bcrypt from "bcrypt"
import fetch from "node-fetch";
import Video from "../models/Video";

export const getJoin = (req, res) => res.render("join", { pageTitle: "Join" });
export const postJoin = async (req, res) => {
    const { name, username, email, password, password2, location } = req.body;
    const exists = await User.exists({ $or: [{ username }, { email }] });
    if (password !== password2) {
        return res.status(400).render("join", {
            pageTitle: "Join",
            errorMessage: "Password confirmation does not match."
        });
    }
    if (exists) {
        return res.status(400).render("join", {
            pageTitle: "Join",
            errorMessage: "This username/email is already taken"
        });
    }
    try {
        await User.create({
            name, username, email, password, location
        })
        return res.redirect("/login");
    } catch (error) {
        return res.status(400).render("join", { pageTitle: "Join", errorMessage: error._message })
    }
}

export const getLogin = (req, res) => res.render("login", { pageTitle: "Login" });
export const postLogin = async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username, socialOnly: false });
    if (!user) {
        return res.status(400).render("login", {
            pageTitle: "Login",
            errorMessage: "An account with this username does not exists."
        })
    }
    // check if password correct
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
        return res.status(400).render("login", {
            pageTitle: "Login",
            errorMessage: "wrong password"
        })
    }
    req.session.loggedIn = true;
    req.session.user = user;
    return res.redirect("/");
}


export const startGithubLogin = (req, res) => {
    const baseUrl = `https://github.com/login/oauth/authorize`;
    const config = {
        client_id: process.env.GH_CLIENT,
        allow_signup: false,
        scope: "read:user user:email"
    }
    const params = new URLSearchParams(config).toString();

    const fianlUrl = `${baseUrl}?${params}`;
    return res.redirect(fianlUrl);
}

export const finishGithubLogin = async (req, res) => {
    const baseUrl = "https://github.com/login/oauth/access_token";
    const config = {
        client_id: process.env.GH_CLIENT,
        client_secret: process.env.GH_SECRET,
        code: req.query.code
    }
    const params = new URLSearchParams(config).toString();
    const finalUrl = `${baseUrl}?${params}`;
    const tokenRequest = await (await fetch(finalUrl, {
        method: "POST",
        headers: {
            Accept: "application/json"
        }
    })).json();
    if ("access_token" in tokenRequest) {
        // access api
        const { access_token } = tokenRequest;
        const apiUrl = "https://api.github.com"
        const userData = await (await fetch(`${apiUrl}/user`, {
            headers: {
                Authorization: `token ${access_token}`
            }
        })).json();
        const emailData = await (await fetch(`${apiUrl}/user/emails`, {
            headers: {
                Authorization: `token ${access_token}`
            }
        })).json();
        const emailObj = emailData.find(email => email.primary === true && email.verified === true)

        if (!emailObj) {
            return res.redirect("/login");
        }
        let user = await User.findOne({ email: emailObj.email });
        if (!user) {
            user = await User.create({
                name: userData.name,
                avtarUrl: userData.avatar_url,
                socialOnly: true,
                username: userData.login,
                email: emailObj.email,
                password: "",
                locaton: userData.location
            });
        }
        // create an account

        req.session.loggedIn = true;
        req.session.user = user;
        return res.redirect("/")


    } else {
        return res.redirect("/login");
    }
}

export const logout = (req, res) => {
    req.session.destroy();
    req.flash("info", "Bye Bye")
    return res.redirect("/");
}
export const getEdit = (req, res) => {
    res.render('edit-profile', { pageTitle: "Edit Profile" })
}
export const postEdit = async (req, res) => {
    const {
        session: {
            user: { _id, avatarUrl }
        },
        body: {
            name, email, username, location
        },
        file
    } = req;
    // const exists = await User.exists({ $or: [{ username, email }] })
    const updatedUser = await User.findByIdAndUpdate(_id, {
        avatarUrl: file ? file.path : avatarUrl,
        name, username, email, location
    }, { new: true });
    req.session.user = updatedUser;

    return res.redirect("edit")
}

export const getChangePassword = (req, res) => {
    if (req.session.user.socialOnly === true) {
        req.flash("error", "Can't change password.")
        return res.redirect("/")
    }
    return res.render("change-password", { pageTitle: "Change Password" })
}
export const postChangePassword = async (req, res) => {
    //send notification
    const {
        session: {
            user: { _id }
        },
        body: {
            oldPassword, newPassword, newPasswordConfirmation
        }
    } = req;
    const user = await User.findById(_id);
    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) {
        return res.status(400).render("change-password", { pageTitle: "Change Password", errorMessage: "The current password is incorrect" })
    }
    if (newPassword !== newPasswordConfirmation) {
        return res.status(400).render("change-password", { pageTitle: "Change Password", errorMessage: "The password does not match the Confirmation" })
    }


    user.password = newPassword
    await user.save();
    req.flash("info", "Password updated")
    return res.redirect("/");
}


export const see = async (req, res) => {
    const { id } = req.params;
    const user = await User.findById(id).populate("videos");
    if (!user) {
        return res.status(404).render("404", { pageTitle: "User not found." })
    }
    return res.render("profile", { pageTitle: user.name, user });
}