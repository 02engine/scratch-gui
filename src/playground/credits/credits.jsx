import React, {useEffect, useState} from 'react';
import PropTypes from 'prop-types';
import render from '../app-target';
import styles from './credits.css';

import {APP_NAME} from '../../lib/brand';
import {applyGuiColors} from '../../lib/themes/guiHelpers';
import {detectTheme} from '../../lib/themes/themePersistance';

/* eslint-disable react/jsx-no-literals */

applyGuiColors(detectTheme());
document.documentElement.lang = 'en';

const Contributors = () => {
    const [users, setUsers] = useState([]);

    useEffect(() => {
        fetch('./credits/contributors.json')
            .then(r => r.json())
            .then(data => {
                setUsers(
                    data.map(u => ({
                        image: u.avatar,
                        text: u.login,
                        href: u.url
                    }))
                );
            })
            .catch(err => {
                console.warn('[Credits] failed to load contributors', err);
            });
    }, []);

    return <UserList users={users} />;
};

const User = ({image, text, href}) => (
    <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={styles.user}
    >
        <img
            loading="lazy"
            className={styles.userImage}
            src={image}
            width="60"
            height="60"
            alt=""
        />
        <div className={styles.userInfo}>
            {text}
        </div>
    </a>
);

User.propTypes = {
    image: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired,
    href: PropTypes.string
};

const UserList = ({users}) => (
    <div className={styles.users}>
        {users.map((data, index) => (
            <User
                key={`${data.text}-${index}`}
                {...data}
            />
        ))}
    </div>
);

UserList.propTypes = {
    users: PropTypes.arrayOf(PropTypes.object)
};

const Credits = () => {
    const [contributors, setContributors] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/credits/contributors.json')
            .then(res => {
                if (!res.ok) throw new Error('Failed to load contributors');
                return res.json();
            })
            .then(data => {
                const mapped = data.map(user => ({
                    image: user.avatar,
                    text: user.login,
                    href: user.url
                }));

                // 可选：每次刷新随机顺序（与你页面底部说明一致）
                mapped.sort(() => Math.random() - 0.5);

                setContributors(mapped);
            })
            .catch(err => {
                console.error('[Credits] Failed to load contributors:', err);
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    return (
        <main className={styles.main}>
            <header className={styles.headerContainer}>
                <h1 className={styles.headerText}>
                    {APP_NAME} Credits
                </h1>
            </header>

            <section>
                <p>
                    The {APP_NAME} project is made possible by the work of many volunteers.
                </p>
            </section>

            {APP_NAME !== '02Engine' && (
                <section>
                    <h2>02Engine</h2>
                    <p>
                        {APP_NAME} is based on <a href="https://editor.02engine.org/">02Engine</a>.
                    </p>
                </section>
            )}

            <section>
                <h2>Scratch</h2>
                <p>
                    {APP_NAME} is based on the work of the <a href="https://scratch.mit.edu/credits">Scratch contributors</a> but is not endorsed by Scratch in any way.
                </p>
                <p>
                    <a href="https://scratch.mit.edu/donate">
                        Donate to support Scratch.
                    </a>
                </p>
            </section>

            <section>
                <h2>Contributors</h2>
                <Contributors />
            </section>

            <section>
                <p>
                    <i>
                        Individual contributors are listed in particular order of contribution.
                    </i>
                </p>
            </section>
        </main>
    );
};

render(<Credits />);
