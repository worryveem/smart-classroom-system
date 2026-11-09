package iot.iot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties="app.classroom.alerts-enabled=false")
@ActiveProfiles("local")
@AutoConfigureMockMvc(print=MockMvcPrint.NONE)
@EnabledIfEnvironmentVariable(named="SMARTCLASS_MYSQL_TEST_URL",matches=".+")
class AccountIntegrationTests {
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->MySqlTestSupport.url("_account")); p.add("app.jwt.secret",MySqlTestSupport::jwtSecret);
    }
    @Autowired MockMvc mvc; @Autowired JdbcTemplate db; @Autowired ObjectMapper mapper; @Autowired PasswordEncoder encoder;
    String admin,teacher,student;
    JsonNode call(MockHttpServletRequestBuilder request,String token,Object body,int expected) throws Exception {
        if(token!=null)request.header("Authorization",token);
        if(body!=null)request.contentType("application/json").content(mapper.writeValueAsString(body));
        return mapper.readTree(mvc.perform(request).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).path("data");
    }
    String login(String username,String password) throws Exception { return "Bearer "+call(post("/api/auth/login"),null,Map.of("username",username,"password",password),200).path("accessToken").asText(); }
    @BeforeEach void setup() throws Exception {
        for(var pair:Map.of("admin","Admin@12345","teacher","Teacher@12345","student","Student@12345").entrySet())
            db.update("UPDATE users SET password_hash=?,credentials_version=0,full_name='',email='',phone='' WHERE username=?",encoder.encode(pair.getValue()),pair.getKey());
        admin=login("admin","Admin@12345");teacher=login("teacher","Teacher@12345");student=login("student","Student@12345");
    }
    @Test void everyRoleCanUpdateOnlyItsOwnContactInformation() throws Exception {
        for(var item:Map.of("admin",admin,"teacher",teacher,"student",student).entrySet()) {
            String hash=db.queryForObject("SELECT password_hash FROM users WHERE username=?",String.class,item.getKey());
            var profile=call(put("/api/account/profile?userId=1"),item.getValue(),Map.of("fullName","  Nguyễn Văn An  ","email",item.getKey()+"@example.test","phone","+84 912 345 678"),200);
            assertEquals(item.getKey(),profile.path("username").asText());assertEquals("Nguyễn Văn An",profile.path("fullName").asText());
            assertFalse(profile.has("passwordHash"));assertFalse(profile.has("password_hash"));assertFalse(profile.has("credentialsVersion"));
            assertEquals(hash,db.queryForObject("SELECT password_hash FROM users WHERE username=?",String.class,item.getKey()));
            assertEquals("Nguyễn Văn An",call(get("/api/account/profile"),item.getValue(),null,200).path("fullName").asText());
        }
        assertEquals("ADMIN",db.queryForObject("SELECT role FROM users WHERE username='admin'",String.class));
    }
    @Test void profileRejectsIdentityRoleAndUnknownFieldsAndNeverChangesAnotherAccount() throws Exception {
        for(String key:List.of("id","userId","role","username","password","credentialsVersion")) {
            var body=new HashMap<String,Object>();body.put("fullName","Name");body.put("email","");body.put("phone","");body.put(key,"ADMIN");
            call(put("/api/account/profile"),student,body,400);
        }
        assertEquals("STUDENT",db.queryForObject("SELECT role FROM users WHERE username='student'",String.class));
        assertEquals("",call(get("/api/account/profile"),admin,null,200).path("fullName").asText());
    }
    @Test void profileValidatesContactFieldsAndAllowsClearingOptionalValues() throws Exception {
        for(var body:List.of(Map.of("fullName","A".repeat(101),"email","","phone",""),Map.of("fullName","Name","email","invalid","phone",""),Map.of("fullName","Name","email","","phone","123letters")))
            call(put("/api/account/profile"),teacher,body,400);
        call(put("/api/account/profile"),teacher,Map.of("fullName","","email","","phone",""),200);
        assertEquals("",call(get("/api/account/profile"),teacher,null,200).path("phone").asText());
    }
    @Test void changingPasswordRequiresTheCurrentPasswordAndPreservesTheSessionOnValidationFailure() throws Exception {
        call(post("/api/account/password"),teacher,Map.of("currentPassword","WrongPassword","newPassword","NewPassword@123"),400);
        call(post("/api/account/password"),teacher,Map.of("currentPassword","Teacher@12345","newPassword","Teacher@12345"),400);
        call(post("/api/account/password"),teacher,Map.of("currentPassword","Teacher@12345","newPassword","é".repeat(37)),400);
        call(post("/api/account/password"),teacher,Map.of("currentPassword","Teacher@12345","newPassword","short"),400);
        call(get("/api/auth/me"),teacher,null,200);
        assertEquals(0,db.queryForObject("SELECT credentials_version FROM users WHERE username='teacher'",Long.class));
    }
    @Test void changedPasswordInvalidatesAllOldTokensAndDoesNotChangeTheRoleOrProfile() throws Exception {
        String otherSession=login("teacher","Teacher@12345");
        call(put("/api/account/profile"),teacher,Map.of("fullName","Giáo viên A","email","teacher@example.test","phone","0912345678"),200);
        call(post("/api/account/password"),teacher,Map.of("currentPassword","Teacher@12345","newPassword","NewPassword@123"),200);
        call(get("/api/auth/me"),teacher,null,401);call(get("/api/account/profile"),otherSession,null,401);
        call(post("/api/auth/login"),null,Map.of("username","teacher","password","Teacher@12345"),401);
        String fresh=login("teacher","NewPassword@123");
        var profile=call(get("/api/account/profile"),fresh,null,200);
        assertEquals("TEACHER",profile.path("role").asText());assertEquals("Giáo viên A",profile.path("fullName").asText());
        assertTrue(encoder.matches("NewPassword@123",db.queryForObject("SELECT password_hash FROM users WHERE username='teacher'",String.class)));
        call(get("/api/auth/me"),admin,null,200);
    }
    @Test void adminPasswordResetAlsoInvalidatesExistingTokensWithoutChangingProfileFields() throws Exception {
        long id=db.queryForObject("SELECT id FROM users WHERE username='teacher'",Long.class);
        call(put("/api/account/profile"),teacher,Map.of("fullName","Giáo viên A","email","","phone",""),200);
        call(put("/api/users/"+id),admin,Map.of("username","teacher","role","TEACHER","password","ResetPassword@123"),200);
        call(get("/api/auth/me"),teacher,null,401);
        assertEquals("Giáo viên A",call(get("/api/account/profile"),login("teacher","ResetPassword@123"),null,200).path("fullName").asText());
    }
    @Test void accountEndpointsRequireAuthenticationAndResponsesAreNotCached() throws Exception {
        call(get("/api/account/profile"),null,null,401);
        call(put("/api/account/profile"),null,Map.of("fullName","","email","","phone",""),401);
        call(post("/api/account/password"),null,Map.of("currentPassword","Teacher@12345","newPassword","NewPassword@123"),401);
        mvc.perform(get("/api/account/profile").header("Authorization",teacher)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
    }
}
